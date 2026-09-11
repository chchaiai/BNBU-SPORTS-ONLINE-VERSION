import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function probeEnduranceHttp({ prisma, fixture, baseUrl, request, adminToken, teacherToken, token }) {
      const base = '/admin/endurance-tables';
      const tables = await request(base, adminToken);
      assert.equal(tables.length, 4);
      assert.equal(tables.reduce((sum, table) => sum + table.bands.length, 0), 404);
      assert.deepEqual(await request(base, adminToken), tables);
      const count = await prisma.$queryRaw`SELECT count(*) AS total FROM v81_endurance_tables WHERE organization_id=${fixture.organizationId}::uuid`;
      assert.equal(Number(count[0].total), 0);
      const table = tables[0], first = table.bands[0];
      const tableKey = { gender: table.gender, gradeGroup: table.gradeGroup, runType: table.runType };
      const { id, ...band } = first;
      const update = { ...tableKey, ...band, note: ' Synthetic note ', expectedVersion: 0 };
      const replayKey = randomUUID();
      let current = await request(`${base}/rules/${id}`, adminToken, update, replayKey);
      assert.equal(current.version, 1);
      assert.equal(current.bands[0].note, 'Synthetic note');
      assert.deepEqual(await request(`${base}/rules/${id}`, adminToken, update, replayKey), current);
      const addition = { ...tableKey, minSeconds: 601, maxSeconds: 603, score: 0, tier: 'fail', note: '', expectedVersion: 1 };
      current = await request(`${base}/rules`, adminToken, addition);
      assert.equal(current.bands.length, 102);
      const added = current.bands.at(-1);
      current = await request(`${base}/rules/${added.id}/delete`, adminToken, { ...tableKey, expectedVersion: 2 });
      assert.equal(current.bands.length, 101);
      assert.equal(current.version, 3);
      for (const [route, body, access, expected] of [
        [`${base}/rules/${table.bands[50].id}/delete`, { ...tableKey, expectedVersion: 3 }, adminToken, 422],
        [`${base}/rules/${id}`, { ...update, expectedVersion: 3, score: 100, tier: 'fail' }, adminToken, 422],
        [`${base}/rules/${id}`, update, adminToken, 409],
        [`${base}/rules`, { ...addition, expectedVersion: 3 }, teacherToken, 403],
        [`${base}/rules`, { ...addition, expectedVersion: 3 }, token, 403],
      ]) {
        const response = await fetch(baseUrl + route, { method: 'POST', headers: { authorization: `Bearer ${access}`,
          'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(body) });
        assert.equal(response.status, expected);
      }
      const reread = await request(base, adminToken);
      assert.deepEqual(reread.find(item => item.id === table.id), current);
      const revisions = await prisma.$queryRaw`SELECT version FROM v81_endurance_table_revisions WHERE table_id=${table.id}::uuid ORDER BY version`;
      assert.deepEqual(revisions.map(row => row.version), [1, 2, 3]);
      const successfulEvents = await prisma.$queryRaw`SELECT event_outcome,actor_role_snapshot FROM v81_events
        WHERE resource_type='ENDURANCE_TABLE' AND resource_id=${table.id}::uuid ORDER BY version`;
      assert.deepEqual(successfulEvents, Array.from({length:3},()=>({event_outcome:'SUCCEEDED',actor_role_snapshot:'ADMIN'})));
      const write = (body) => fetch(baseUrl + `${base}/rules/${id}`, { method: 'POST', headers: {
        authorization: `Bearer ${adminToken}`, 'content-type': 'application/json', 'idempotency-key': randomUUID(),
      }, body: JSON.stringify(body) });
      const competing = await Promise.all(['Concurrent A', 'Concurrent B'].map(note => write({ ...update, note, expectedVersion: 3 })));
      assert.deepEqual(competing.map(response => response.status).sort(), [201, 409]);
      current = (await request(base, adminToken)).find(item => item.id === table.id);
      assert.equal(current.version, 4);
      assert.ok(['Concurrent A', 'Concurrent B'].includes(current.bands[0].note));
      try {
        for (const [permissions, status] of [[[], 403], [['HELP_CENTER'], 403], [['GLOBAL_RULES'], 200], [[], 403]]) {
          await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb
            WHERE user_id=${fixture.adminUserId}::uuid`;
          const readResponse = await fetch(baseUrl + base, { headers: { authorization: `Bearer ${adminToken}` } });
          assert.equal(readResponse.status, status);
          const written = await write({ ...update, expectedVersion: current.version, note: 'Authorized rules admin' });
          assert.equal(written.status, status === 200 ? 201 : 403);
          if (written.ok) current = (await written.json()).data;
        }
      } finally {
        await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb
          WHERE user_id=${fixture.adminUserId}::uuid`;
      }
      assert.equal(current.version, 5);
      const finalTables = await request(base, adminToken);
      assert.deepEqual(finalTables.find(item => item.id === table.id), current);
      assert.deepEqual(finalTables.filter(item => item.id !== table.id), tables.filter(item => item.id !== table.id));
      const finalRevisions = await prisma.$queryRaw`SELECT version FROM v81_endurance_table_revisions WHERE table_id=${table.id}::uuid ORDER BY version`;
      assert.deepEqual(finalRevisions.map(row => row.version), [1, 2, 3, 4, 5]);
      console.log(JSON.stringify({ check: 'ENDURANCE_CONCURRENT_VERSION_AND_SUBADMIN_PERMISSION_REVOCATION', result: 'PASS' }));
}
