"use client";
import { StudentMajorCorrection } from './student-major-correction';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmTeacherAccounts, previewTeacherAccounts } from './teacher-import-api';
import { AdminStudentDeletion } from './admin-student-deletion';
import { AdminStudentBulkDeletion } from './admin-student-bulk-deletion';
import { selectedStudents, type DeletionStudent } from './student-deletion-batch';
import { AppSelect } from "./app-select";
import { pageItems } from "./admin-domain";
import { adminCopy, adminErrorCopy } from "./admin-i18n";
import { ApiError, request, getAccountSecurity, toUserFacingError, formatUserFacingError, type UserFacingError } from "./api-client";
import { deleteTeacherUser, getStudentProfile, getTeacherProfile, importUsers, listAssociatedTeacherProfiles, listStudentProfiles, previewUserImport } from "./admin-service";
import { AdminServiceError, type AdminLocale, type AdminUser, type StudentProfileProjection, type TeacherProfileProjection } from "./admin-types";
import { AdminBadge, AdminDialog, AdminDrawer, AdminEmpty, AdminField, AdminLoading, AdminPagination, AdminSectionHeading, formatAdminDate } from "./admin-components";
import { ErrorPanel } from "./error-panel";
import { useAdminStore } from "./admin-store";

import { adminStudentRegion } from "./student-region";

const demoOrganizationId = "org-bnbu-demo";
const teacherCsvTemplate = "employee_id,name,email,college\nT2026001,教师姓名,teacher@bnbu.edu.cn,体育部";

function demoStudent(user: AdminUser): StudentProfileProjection {
  return {
    id: user.id,
    organizationId: demoOrganizationId,
    userId: user.id,
    studentNumber: user.account,
    fullName: user.name,
    gender: user.gender?.toUpperCase() ?? "UNKNOWN",
    gradeYear: user.admissionYear ?? 0,
    collegeName: user.college,
    majorName: null,
    administrativeClassName: user.className ?? null,
    status: user.status === "ACTIVE" ? "ACTIVE" : "PENDING",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: null,
    version: user.tokenVersion + 1,
  };
}

function demoTeacher(user: AdminUser): TeacherProfileProjection {
  return {
    id: user.id,
    organizationId: demoOrganizationId,
    userId: user.id,
    employeeNumber: user.account,
    fullName: user.name,
    collegeName: user.college,
    departmentName: user.college,
    title: "体育教师",
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: null,
    version: user.tokenVersion + 1,
  };
}

export function AdminUsers({ locale }: { locale: AdminLocale }) {
  const { mode, state, busyKey, error: mutationError, clearError, run } = useAdminStore();
  const [studentDeletionAccess, setStudentDeletionAccess] = useState<{ adminId: string | undefined; userId: string; allowed: boolean } | null>(null);
  const canEraseStudent = mode === 'real' && studentDeletionAccess?.adminId === state?.currentAdminId && studentDeletionAccess?.allowed === true;
  useEffect(() => {
    let active = true;
    if (mode === 'real') void getAccountSecurity().then(access => {
      if (active) setStudentDeletionAccess({ adminId: state?.currentAdminId, userId: access.userId, allowed: access.adminKind === 'SUPER' && !access.mustChangePassword });
    }).catch(() => { if (active) setStudentDeletionAccess(null); });
    return () => { active = false; };
  }, [mode, state?.currentAdminId]);
  const [students, setStudents] = useState<StudentProfileProjection[]>([]);
  const [teachers, setTeachers] = useState<TeacherProfileProjection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UserFacingError | null>(null);
  const [view, setView] = useState<"students" | "teacher">("students");
  const [query, setQuery] = useState("");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [markingProfile, setMarkingProfile] = useState(false);
  const [markTarget,setMarkTarget] = useState<StudentProfileProjection|null>(null);
  const [markReason,setMarkReason] = useState("");
  const [status, setStatus] = useState("all");
  const [college, setCollege] = useState("all");
  const [page, setPage] = useState(1);
  const [grade, setGrade] = useState("all");
  const [gender, setGender] = useState("all");
  const [department, setDepartment] = useState("all");
  const [course, setCourse] = useState("all");
  const [emailVerification, setEmailVerification] = useState("all");
  const [registeredFrom, setRegisteredFrom] = useState("");
  const [registeredTo, setRegisteredTo] = useState("");
  const [studentDetail, setStudentDetail] = useState<StudentProfileProjection | null>(null);
  const [studentDeleteTarget, setStudentDeleteTarget] = useState<StudentProfileProjection | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [batchTargets, setBatchTargets] = useState<DeletionStudent[] | null>(null);
  const [teacherDetail, setTeacherDetail] = useState<TeacherProfileProjection | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState(teacherCsvTemplate);
  const [initialPassword, setInitialPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [importPreview, setImportPreview] = useState<ReturnType<typeof previewUserImport>>([]);
  const [importIssue, setImportIssue] = useState("");
  const importRevision = useRef(0);
  const realPreview = useRef<{ csv: string; token: string; key: string } | null>(null);
  function invalidatePreview() {
    importRevision.current += 1;
    realPreview.current = null;
    setImportPreview([]);
  }
  const [deleteTarget, setDeleteTarget] = useState<{ teacher: TeacherProfileProjection; assignedCourseCount: number } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletingTeacher,setDeletingTeacher]=useState(false);
  const [teacherDeletePending,setTeacherDeletePending]=useState(false);
  const [teacherDeleteError,setTeacherDeleteError]=useState<UserFacingError|null>(null);
  const teacherDeleteIntent=useRef<{key:string;id:string;body:{expectedVersion:number;confirmationEmployeeNumber:string;reason:string;confirmTeacherDeletion:true}}|null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const load = useCallback(async () => {
    setSelectedStudentIds([]);
    setLoading(true);
    setError(null);
    try {
      if (mode === "demo") {
        setStudents((state?.users ?? []).filter((user) => user.role === "student").map(demoStudent).sort((left, right) => left.studentNumber.localeCompare(right.studentNumber)));
        setTeachers((state?.users ?? []).filter((user) => user.role === "teacher").map(demoTeacher).sort((left, right) => left.employeeNumber.localeCompare(right.employeeNumber)));
        return;
      }
      const [loadedStudents, loadedTeachers] = await Promise.all([
        listStudentProfiles(),
        listAssociatedTeacherProfiles(),
      ]);
      setStudents([...loadedStudents].sort((left, right) => left.studentNumber.localeCompare(right.studentNumber)));
      setTeachers(loadedTeachers);
    } catch (failure) {
      setError(toUserFacingError(failure, locale));
    } finally {
      setLoading(false);
    }
  }, [locale, mode, state]);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => { void load(); }, 0);
    return () => globalThis.clearTimeout(timer);
  }, [load]);

  const statuses = useMemo(() => [...new Set((view === "students" ? students : teachers).map((student) => student.status))].sort(), [students, teachers, view]);
  const colleges = useMemo(() => [...new Set((view === "students" ? students : teachers).map((student) => student.collegeName).filter((value): value is string => Boolean(value)))].sort(), [students, teachers, view]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return students.filter((student) => {
      if(qualityFilter!=="all" && student.profileQualityStatus!==qualityFilter) return false;
      if (emailVerification !== "all" && student.emailVerified !== (emailVerification === "verified")) return false;
      if (course !== "all" && !(student.courseAssociations ?? []).some(item => item.classSectionId === course)) return false;
      const registeredDate = new Date(student.createdAt);
      const registered = `${registeredDate.getFullYear()}-${String(registeredDate.getMonth()+1).padStart(2,"0")}-${String(registeredDate.getDate()).padStart(2,"0")}`;
      if (registeredFrom && registered < registeredFrom) return false;
      if (registeredTo && registered > registeredTo) return false;
      if (grade !== "all" && String(student.gradeYear) !== grade) return false;
      if (gender !== "all" && student.gender !== gender) return false;
      if (status !== "all" && student.status !== status) return false;
      if (college !== "all" && student.collegeName !== college) return false;
      return !normalized || [student.studentNumber, student.fullName, student.collegeName, student.majorName, student.email, student.dateOfBirth, student.regionCode, student.otherRegionName, adminStudentRegion(student, locale), ...(student.courseAssociations ?? []).flatMap(item => [item.classCode, item.className, item.courseName, item.semesterName])]
        .filter(Boolean).join(" ").toLocaleLowerCase().includes(normalized);
    });
  }, [qualityFilter, college, query, status, students, grade, gender, course, registeredFrom, registeredTo, emailVerification, locale]);
  const filteredTeachers = teachers.filter(teacher =>
    (status === 'all' || teacher.status === status) && (college === 'all' || teacher.collegeName === college) &&
    (department === 'all' || teacher.departmentName === department) &&
    (!query.trim() || [teacher.employeeNumber, teacher.fullName, teacher.collegeName, teacher.departmentName, teacher.title].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase())));
  const teacherPaged = pageItems(filteredTeachers, page, 10);
  const resetFilters = () => { setQualityFilter("all"); setQuery(''); setStatus('all'); setCollege('all'); setGrade('all'); setGender('all'); setDepartment('all'); setCourse('all'); setEmailVerification('all'); setRegisteredFrom(''); setRegisteredTo(''); setPage(1); setSelectedStudentIds([]); };
  const paged = pageItems(filtered, page, 10);
  const selected = selectedStudents(selectedStudentIds, filtered);
  const selectedSet = new Set(selected.map(student => student.id));
  const allPageSelected = paged.items.length > 0 && paged.items.every(student => selectedSet.has(student.id));
  function selectPage(checked: boolean) {
    const pageIds = new Set(paged.items.map(student => student.id));
    setSelectedStudentIds(ids => checked ? [...new Set([...ids, ...pageIds])] : ids.filter(id => !pageIds.has(id)));
  }
  const studentTitle = locale === "zh" ? "学生账户" : "Student accounts";
  const teacherTitle = locale === "zh" ? "教师账户" : "Teacher accounts";
  const studentDescription = locale === "zh"
    ? "查看并筛选学生登记资料、邮箱验证和课程关联情况。"
    : "View and filter registered student details, email verification and course associations.";
  const teacherDescription = locale === "zh"
    ? "查看和筛选教师资料，批量建立或管理教师账号。"
    : "View and filter teacher profiles, create accounts in batches and manage accounts.";

  async function openStudent(id: string) {
    setError(null);
    try {
      if (mode === "demo") {
        setStudentDetail(students.find((student) => student.id === id) ?? null);
        return;
      }
      setStudentDetail(await getStudentProfile(id));
    } catch (failure) {
      setError(toUserFacingError(failure, locale));
    }
  }

  function openTeacherImport() {
    clearError();
    setImportIssue("");
    invalidatePreview();
    setCsvText(teacherCsvTemplate);
    setInitialPassword("");
    setShowPassword(false);
    setImportOpen(true);
  }

  async function readTeacherCsv(file: File | null) {
    if (!file) return;
    setImportIssue("");
    invalidatePreview();
    const revision = importRevision.current;
    try {
      const text = await file.text();
      if (revision === importRevision.current) setCsvText(text);
    } catch (failure) {
      if (revision === importRevision.current) setImportIssue(formatUserFacingError(failure, locale));
    }
  }

  function closeTeacherImport() {
    invalidatePreview();
    setImportOpen(false);
    setInitialPassword('');
    clearError();
  }

  async function buildTeacherPreview() {
    clearError();
    setImportIssue("");
    invalidatePreview();
    const revision = importRevision.current;
    try {
      if (mode === 'real') {
        const preview = await previewTeacherAccounts(csvText);
        if (revision !== importRevision.current) return;
        setImportPreview(preview.rows.map(row => ({ line: row.rowNumber + 1,
          input: { account: row.employeeId, name: row.name, email: row.email, college: row.college ?? '', role: 'teacher', status: 'ACTIVE' },
          errors: row.errors })));
        realPreview.current = preview.canCreate && preview.previewToken ? { csv: csvText, token: preview.previewToken, key: crypto.randomUUID() } : null;
        return;
      }
      setImportPreview(previewUserImport(csvText, "teacher", state?.users ?? [], initialPassword));
    } catch (failure) {
      if (revision !== importRevision.current) return;
      setImportPreview([]);
      setImportIssue(mode === 'real' ? formatUserFacingError(failure, locale) : failure instanceof AdminServiceError
        ? adminErrorCopy(locale, failure.message)
        : (locale === "zh" ? "无法读取导入内容，请检查 CSV 格式。" : "The import could not be read. Check the CSV format."));
    }
  }

  async function confirmTeacherImport() {
    if (mode === 'real') {
      const preview = realPreview.current;
      if (!preview || preview.csv !== csvText || !state) return;
      const result = await run('teacher-import', async () => ({ state,
        value: await confirmTeacherAccounts(csvText, preview.token, initialPassword, preview.key) }),
        locale === 'zh' ? '教师账号已批量建立' : 'Teacher accounts created');
      if (!result) return;
      setImportOpen(false);
      invalidatePreview();
      setInitialPassword('');
      await load();
      return;
    }
    const imported = await run(
      "teacher-import",
      () => importUsers(csvText, "teacher", initialPassword),
      locale === "zh" ? "教师账号已批量建立" : "Teacher accounts created",
    );
    if (!imported) return;
    setImportOpen(false);
    setImportPreview([]);
    setInitialPassword("");
  }

  function beginTeacherDelete(teacher: TeacherProfileProjection) {
    setTeacherDeleteError(null);
    clearError();
    setDeleteReason("");
    setDeleteConfirmation("");
    setDeleteTarget({
      teacher,
      assignedCourseCount: state?.users.find((user) => user.id === teacher.userId && user.role === "teacher")?.assignedCourseCount ?? 0,
    });
  }

  async function confirmTeacherDelete() {
    if (!deleteTarget || deletingTeacher) return;
    if(mode==='real'){
      teacherDeleteIntent.current??={key:crypto.randomUUID(),id:deleteTarget.teacher.id,body:{expectedVersion:deleteTarget.teacher.version,confirmationEmployeeNumber:deleteConfirmation.trim(),reason:deleteReason.trim(),confirmTeacherDeletion:true}};
      const intent=teacherDeleteIntent.current;setTeacherDeletePending(true);setDeletingTeacher(true);setTeacherDeleteError(null);
      try{
        const result=await request<{id:string;deleted:boolean}>(`/admin/teachers/${encodeURIComponent(intent.id)}/delete`,{method:'POST',headers:{'Idempotency-Key':intent.key},body:intent.body});
        if(result.id!==intent.id||result.deleted!==true)throw new Error('Deletion receipt unavailable');
        teacherDeleteIntent.current=null;setTeacherDeletePending(false);setTeacherDetail(null);setDeleteTarget(null);setDeleteReason('');setDeleteConfirmation('');await load();
      }catch(failure){
        if(failure instanceof ApiError&&failure.status>=400&&failure.status<500){teacherDeleteIntent.current=null;setTeacherDeletePending(false);}
        const projected=toUserFacingError(failure,locale);
        setTeacherDeleteError(projected);
      }finally{setDeletingTeacher(false);}
      return;
    }
    const existing = state?.users.find((user) => user.id === deleteTarget.teacher.userId && user.role === "teacher");
    if (!existing) return;
    const deleted = await run(
      `teacher-delete-${existing.id}`,
      () => deleteTeacherUser(existing.id, deleteConfirmation, deleteReason),
      locale === "zh" ? "教师账号已删除" : "Teacher account deleted",
    );
    if (!deleted) return;
    setTeacherDetail(null);
    setDeleteTarget(null);
    setDeleteReason("");
    setDeleteConfirmation("");
  }

  if (loading) return <AdminLoading locale={locale} />;
  if (error && students.length === 0) return (
    <div className="admin-page-stack">
      <ErrorPanel error={error} locale={locale} />
      <div className="admin-form-actions">
        <button className="primary-button" type="button" onClick={() => void load()}>{adminCopy(locale, "retry")}</button>
      </div>
    </div>
  );

  return (
    <div className="admin-page-stack admin-users-page">
      <ErrorPanel error={error} locale={locale} />
      {markTarget && <div className="admin-surface" role="dialog" aria-label={locale==='zh'?'要求重新完善':'Require correction'}><h3>{markTarget.fullName} · {markTarget.studentNumber}</h3><p>{locale==='zh'?'保存后，该学生必须完善资料才能打卡。原因将向学生展示。':'The student must correct their profile before checking in. The reason is visible to the student.'}</p><input aria-label={locale==='zh'?'原因':'Reason'} maxLength={200} value={markReason} onChange={event=>setMarkReason(event.target.value)} disabled={markingProfile}/><button className="primary-button" disabled={markingProfile || !markReason.trim()} onClick={async()=>{setMarkingProfile(true);try{await request(`/students/${markTarget.id}`,{method:'PATCH',body:{expectedVersion:markTarget.version,profileUpdateReason:markReason.trim()}});setMarkTarget(null);await load();}catch(failure){setError(toUserFacingError(failure,locale));}finally{setMarkingProfile(false);}}}>{locale==='zh'?'保存':'Save'}</button><button disabled={markingProfile} onClick={()=>setMarkTarget(null)}>{locale==='zh'?'取消':'Cancel'}</button></div>}
      <nav className="admin-profile-switcher" aria-label={locale === "zh" ? "账户类型" : "Account type"}>
        <button type="button" className={view === "students" ? "is-active" : ""} aria-pressed={view === "students"} onClick={() => { setView("students"); resetFilters(); }}>
          <span>{studentTitle}</span><small>{students.length}</small>
        </button>
        <button type="button" className={view === "teacher" ? "is-active" : ""} aria-pressed={view === "teacher"} onClick={() => { setView("teacher"); resetFilters(); }}>
          <span>{teacherTitle}</span><small>{teachers.length}</small>
        </button>
      </nav>

          <div className="admin-audit-filters">
            <AdminField locale={locale} label={adminCopy(locale, "search")}><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); setSelectedStudentIds([]); }} placeholder={view === "students" ? (locale === "zh" ? "学号、姓名、邮箱、专业、课程或生源地" : "Number, name, email, major, course or region") : adminCopy(locale, "account_search")} /></AdminField>
            <AppSelect label={adminCopy(locale, "status_filter")} value={status} options={[{ value: "all", label: adminCopy(locale, "all") }, ...statuses.map((value) => ({ value, label: view === "students" ? (value === "ACTIVE" ? (locale === "zh" ? "已进班" : "Enrolled") : (locale === "zh" ? "已退班" : "Withdrawn")) : value }))]} onChange={(value) => { if (value) { setStatus(String(value)); setPage(1); setSelectedStudentIds([]); } }} />
            <AppSelect label={adminCopy(locale, "college")} value={college} searchable options={[{ value: "all", label: adminCopy(locale, "all") }, ...colleges.map((value) => ({ value, label: value }))]} onChange={(value) => { if (value) { setCollege(String(value)); setPage(1); setSelectedStudentIds([]); } }} />
            {view === 'students' ? <>
              <AppSelect label={locale==='zh'?'个人信息状态':'Profile status'} value={qualityFilter} options={['all','NORMAL','REQUIRES_PROFILE_UPDATE','PENDING_REVIEW'].map(value=>({value,label:qualityLabel(value,locale)}))} onChange={value=>{setQualityFilter(String(value));setPage(1);}} />
              <AppSelect label={locale === 'zh' ? '邮箱验证' : 'Email verification'} value={emailVerification} options={[{value:'all',label:adminCopy(locale,'all')},{value:'verified',label:locale==='zh'?'已验证':'Verified'},{value:'unverified',label:locale==='zh'?'未验证':'Unverified'}]} onChange={value=>{setEmailVerification(String(value));setPage(1); setSelectedStudentIds([]);}} />
              <AppSelect label={locale === 'zh' ? '课程/教学班（含历史）' : 'Course/class (including history)'} value={course} searchable options={[{value:'all',label:adminCopy(locale,'all')}, ...Array.from(new Map(students.flatMap(s => (s.courseAssociations ?? []).map(item => [item.classSectionId, {value:item.classSectionId,label:`${item.semesterName} · ${item.courseName} · ${item.className}`}] as const))).values())]} onChange={value=>{setCourse(String(value));setPage(1); setSelectedStudentIds([]);}} />
              <AdminField locale={locale} label={locale === 'zh' ? '注册日期起' : 'Registered from'}><input type="date" value={registeredFrom} onChange={event=>{setRegisteredFrom(event.target.value);setPage(1); setSelectedStudentIds([]);}} /></AdminField>
              <AdminField locale={locale} label={locale === 'zh' ? '注册日期止' : 'Registered through'}><input type="date" value={registeredTo} min={registeredFrom || undefined} onChange={event=>{setRegisteredTo(event.target.value);setPage(1); setSelectedStudentIds([]);}} /></AdminField>
              <AppSelect label={locale === 'zh' ? '入学年份' : 'Admission year'} value={grade} options={[{value:'all',label:adminCopy(locale,'all')}, ...[...new Set(students.map(s=>s.gradeYear))].sort().map(value=>({value:String(value),label:String(value)}))]} onChange={value=>{setGrade(String(value));setPage(1); setSelectedStudentIds([]);}} />
              <AppSelect label={adminCopy(locale,'gender')} value={gender} options={[{value:'all',label:adminCopy(locale,'all')},{value:'MALE',label:locale==='zh'?'男':'Male'},{value:'FEMALE',label:locale==='zh'?'女':'Female'},{value:'OTHER',label:locale==='zh'?'其他':'Other'},{value:'UNKNOWN',label:locale==='zh'?'未填写':'Unknown'}]} onChange={value=>{setGender(String(value));setPage(1); setSelectedStudentIds([]);}} />
            </> : <AppSelect label={adminCopy(locale,'department')} value={department} options={[{value:'all',label:adminCopy(locale,'all')}, ...[...new Set(teachers.map(t=>t.departmentName).filter((v):v is string=>Boolean(v)))].sort().map(value=>({value,label:value}))]} onChange={value=>{setDepartment(String(value));setPage(1); setSelectedStudentIds([]);}} />}
            <button className="text-button" type="button" onClick={resetFilters}>{locale === 'zh' ? '重置筛选' : 'Reset filters'}</button>
          </div>

      {view === "students" ? (
        <section className="admin-surface admin-table-surface">
          <AdminSectionHeading title={studentTitle} description={studentDescription} action={<button className="text-button" type="button" onClick={() => void load()}>{adminCopy(locale, "refresh_data")}</button>} />
          {canEraseStudent && <div className="admin-bulk-student-toolbar" role="group" aria-label={locale === 'zh' ? '批量选择学生' : 'Select students in bulk'}>
            <span role="status">{locale === 'zh' ? `已选择 ${selected.length} 人 / 筛选结果 ${filtered.length} 人` : `${selected.length} selected / ${filtered.length} filtered students`}</span>
            <button type="button" className="secondary-button" disabled={!paged.items.length} onClick={() => selectPage(true)}>{locale === 'zh' ? `选择当前页（${paged.items.length}）` : `Select this page (${paged.items.length})`}</button>
            <button type="button" className="secondary-button" disabled={!filtered.length} onClick={() => setSelectedStudentIds(filtered.map(student => student.id))}>{locale === 'zh' ? `选择当前筛选结果（${filtered.length}）` : `Select all filtered (${filtered.length})`}</button>
            <button type="button" className="text-button" disabled={!selected.length} onClick={() => setSelectedStudentIds([])}>{locale === 'zh' ? '清空选择' : 'Clear selection'}</button>
            <button type="button" className="danger-button" disabled={!selected.length} onClick={() => setBatchTargets(selected.map(student => ({...student})))}>{locale === 'zh' ? `批量删除（${selected.length}）` : `Delete selected (${selected.length})`}</button>
          </div>}
          {paged.items.length === 0 ? <AdminEmpty locale={locale} filtered={Boolean(query || status !== "all" || college !== "all" || grade !== "all" || gender !== "all" || course !== "all" || emailVerification !== "all" || registeredFrom || registeredTo)} /> : <div className="table-wrap"><table className="admin-table admin-student-accounts-table"><thead><tr>
            {canEraseStudent && <th><input type="checkbox" aria-label={locale === 'zh' ? '选择或取消当前页' : 'Select or clear this page'} checked={allPageSelected} ref={node => { if (node) node.indeterminate = !allPageSelected && paged.items.some(student => selectedSet.has(student.id)); }} onChange={event => selectPage(event.target.checked)} /></th>}
            {(locale === "zh" ? ["学号", "姓名", "邮箱", "性别", "入学年份", "学院", "专业", "课程/教学班（含历史）", "出生日期", "生源地", "注册时间", "账号状态", "个人信息状态", "详情"] : ["Student number", "Name", "Email", "Gender", "Admission year", "College", "Major", "Courses/classes (including history)", "Date of birth", "Region", "Registered", "Status", "Profile status", "Details"]).map(label=><th key={label}>{label}</th>)}
          </tr></thead><tbody>{paged.items.map(student=><tr key={student.id}>
            {canEraseStudent && <td><input type="checkbox" aria-label={`${locale === 'zh' ? '选择' : 'Select'} ${student.studentNumber} ${student.fullName}`} checked={selectedSet.has(student.id)} onChange={event => setSelectedStudentIds(ids => event.target.checked ? [...new Set([...ids, student.id])] : ids.filter(id => id !== student.id))} /></td>}
            <td><code>{student.studentNumber}</code></td><td><b>{student.fullName}</b></td>
            <td>{student.email ?? (locale === "zh" ? "尚未绑定" : "Not bound")}<small className="table-sub">{student.emailVerified === true ? (locale === "zh" ? "已验证" : "Verified") : student.emailVerified === false ? (locale === "zh" ? "未验证" : "Unverified") : ""}</small></td>
            <td>{student.gender === "MALE" ? (locale === "zh" ? "男" : "Male") : student.gender === "FEMALE" ? (locale === "zh" ? "女" : "Female") : student.gender === "OTHER" ? (locale === "zh" ? "其他" : "Other") : "—"}</td>
            <td>{student.gradeYear || "—"}</td><td>{student.collegeName ?? "—"}</td><td>{student.majorName ?? "—"}</td>
            <td>{courseAssociationText(student, locale)}</td><td>{student.dateOfBirth ?? "—"}</td><td>{adminStudentRegion(student, locale)}</td>
            <td>{formatAdminDate(locale, student.createdAt, true)}</td><td><AdminBadge tone={student.status === "ACTIVE" ? "green" : "gray"}>{student.status === "ACTIVE" ? (locale === "zh" ? "已进班" : "Enrolled") : (locale === "zh" ? "已退班" : "Withdrawn")}</AdminBadge></td>
            <td><b>{qualityLabel(student.profileQualityStatus ?? 'NORMAL',locale)}</b><small className="table-sub">{(student.profileQualityReasons ?? []).map(reason=>qualityReason(reason,locale)).join('；')}</small><small className="table-sub">{student.profileConfirmedAt?(locale==='zh'?'已重新填写：':'Confirmed: ')+formatAdminDate(locale,student.profileConfirmedAt):(locale==='zh'?'尚未重新填写':'Not reconfirmed')}</small><small className="table-sub">{formatAdminDate(locale,student.updatedAt)}</small>{mode!=='demo' && <button className="text-button" type="button" disabled={markingProfile} onClick={()=>{setMarkTarget(student);setMarkReason('');}}>{locale==='zh'?'要求重新完善':'Require correction'}</button>}</td>
            <td><button className="text-button" type="button" onClick={()=>void openStudent(student.id)}>{adminCopy(locale,"details")} →</button></td>
          </tr>)}</tbody></table></div>}
          <AdminPagination locale={locale} page={paged.page} totalPages={paged.totalPages} total={paged.total} onPage={setPage} />
        </section>
      ) : (
        <section className="admin-surface admin-table-surface">
          <AdminSectionHeading
            title={teacherTitle}
            description={teacherDescription}
            action={<div className="admin-heading-actions"><button className="text-button" type="button" onClick={() => void load()}>{adminCopy(locale, "refresh_data")}</button><button className="primary-button" type="button" disabled={Boolean(busyKey)} onClick={openTeacherImport}>{locale === "zh" ? "批量建立教师" : "Create teachers"}</button></div>}
          />
          {mode !== "demo" && <aside className="admin-readonly-banner admin-teacher-api-note" role="note">{locale === "zh" ? "核对后可删除教师并关闭其课程，解除在课关系；学生账号和全部历史记录继续保留。" : "Deleting a teacher closes their courses and ends memberships. Student accounts and all historical records are retained."}</aside>}
          {teacherPaged.items.length === 0 ? <AdminEmpty locale={locale} filtered /> : <div className="table-wrap"><table className="admin-table"><thead><tr><th>{adminCopy(locale, "employee_number")}</th><th>{adminCopy(locale, "name")}</th><th>{adminCopy(locale, "college")}</th><th>{adminCopy(locale, "department")}</th><th>{adminCopy(locale, "status")}</th><th>{adminCopy(locale,"updated_at")}</th><th>{locale === "zh" ? "账号管理" : "Account management"}</th></tr></thead><tbody>{teacherPaged.items.map((teacher) => <tr key={teacher.id}><td><code>{teacher.employeeNumber}</code></td><td><b>{teacher.fullName}</b><small className="table-sub">{teacher.title ?? adminCopy(locale, "not_available")}</small></td><td>{teacher.collegeName ?? adminCopy(locale, "not_available")}</td><td>{teacher.departmentName ?? adminCopy(locale, "not_available")}</td><td><AdminBadge tone={teacher.status === "ACTIVE" ? "green" : "gray"}>{teacher.status}</AdminBadge></td><td>{formatAdminDate(locale,teacher.updatedAt)}</td><td><button className="text-button" type="button" onClick={() => { if(mode === "demo") setTeacherDetail(teacher); else void getTeacherProfile(teacher.id).then(setTeacherDetail).catch(failure=>setError(toUserFacingError(failure,locale))); }}>{locale === "zh" ? "管理账号" : "Manage"} →</button></td></tr>)}</tbody></table></div>}
          <AdminPagination locale={locale} page={teacherPaged.page} totalPages={teacherPaged.totalPages} total={teacherPaged.total} onPage={setPage} />
        </section>
      )}

      {studentDetail && <StudentDrawer locale={locale} student={studentDetail} close={() => setStudentDetail(null)} onCorrected={mode==='real'?()=>{setStudentDetail(null);void load();}:undefined} onDelete={mode === "real" && canEraseStudent ? () => { setStudentDeleteTarget(studentDetail); setStudentDetail(null); } : undefined} />}
      {canEraseStudent && studentDeletionAccess?.userId && <AdminStudentBulkDeletion key={studentDeletionAccess.userId} students={batchTargets} ownerId={studentDeletionAccess.userId} locale={locale}
        close={() => { setBatchTargets(null); setSelectedStudentIds([]); void load(); }}
        removed={ids => { const deletedIds = new Set(ids); setStudents(current => current.filter(student => !deletedIds.has(student.id))); setSelectedStudentIds(current => current.filter(id => !deletedIds.has(id))); }} />}
      {studentDeleteTarget && <AdminStudentDeletion student={studentDeleteTarget} locale={locale} close={() => setStudentDeleteTarget(null)} completed={async () => { setStudentDeleteTarget(null); setStudentDetail(null); await load(); }} />}
      {teacherDetail && <TeacherDrawer locale={locale} teacher={teacherDetail} mode={mode} assignedCourseCount={state?.users.find((user) => user.id === teacherDetail.userId && user.role === "teacher")?.assignedCourseCount ?? 0} close={() => setTeacherDetail(null)} onDelete={() => beginTeacherDelete(teacherDetail)} />}

      {importOpen && (
        <AdminDialog
          locale={locale}
          title={locale === "zh" ? "批量建立教师账号" : "Create teacher accounts"}
          description={locale === "zh" ? "导入教师资料，并为本批账号设置统一初始密码。" : "Import teacher profiles and set one initial password for this batch."}
          close={closeTeacherImport}
          dirty={Boolean(initialPassword || csvText !== teacherCsvTemplate)}
          wide
          footer={<><button className="secondary-button" type="button" onClick={closeTeacherImport}>{adminCopy(locale, "cancel")}</button><button className="secondary-button" type="button" onClick={buildTeacherPreview}>{locale === "zh" ? "校验导入内容" : "Validate import"}</button><button className="primary-button" type="button" disabled={Boolean(busyKey) || importPreview.length === 0 || importPreview.some((row) => row.errors.length > 0)} onClick={() => void confirmTeacherImport()}>{busyKey === "teacher-import" ? (locale === "zh" ? "建立中…" : "Creating…") : (locale === "zh" ? `确认建立 ${importPreview.length} 个账号` : `Create ${importPreview.length} accounts`)}</button></>}
        >
          <div className="admin-teacher-import">
            <aside className="admin-info-banner" role="note">{locale === "zh" ? "学生账户不通过此入口创建。教师首次登录后必须修改初始密码；系统不会在账号建立后展示密码。" : "Student accounts are not created here. Teachers must change the initial password at first sign-in, and the password is not shown after creation."}</aside>
            <div className="admin-form-grid two-columns">
              <AdminField locale={locale} label={locale === "zh" ? "教师 CSV 文件" : "Teacher CSV file"} hint={locale === "zh" ? "UTF-8 CSV；必填列：employee_id、name、email" : "UTF-8 CSV; required: employee_id, name, email"}>
                <input type="file" accept=".csv,text/csv" onChange={(event) => void readTeacherCsv(event.target.files?.[0] ?? null)} />
              </AdminField>
              <AdminField locale={locale} label={locale === "zh" ? "统一初始密码" : "Shared initial password"} required errorCode={mutationError?.fieldErrors.initialPassword} hint={locale === "zh" ? "至少 8 位，并包含大写、小写字母和数字" : "At least 8 characters with uppercase, lowercase, and a number"}>
                <input type={showPassword ? "text" : "password"} value={initialPassword} autoComplete="new-password" onChange={(event) => { setInitialPassword(event.target.value); invalidatePreview(); clearError(); }} />
              </AdminField>
            </div>
            <label className="admin-password-toggle"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />{locale === "zh" ? "显示初始密码" : "Show initial password"}</label>
            <AdminField locale={locale} label={locale === "zh" ? "CSV 内容" : "CSV content"} required hint={locale === "zh" ? "可直接粘贴多位教师；college 为可选列。" : "Paste multiple teachers directly; college is optional."}>
              <textarea className="admin-teacher-csv" value={csvText} spellCheck={false} onChange={(event) => { setCsvText(event.target.value); invalidatePreview(); setImportIssue(""); clearError(); }} />
            </AdminField>
            <div className="admin-import-tools"><a className="text-button" download="bnbu-teacher-import-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(teacherCsvTemplate)}`}>{locale === "zh" ? "下载 CSV 模板" : "Download CSV template"}</a><span>{locale === "zh" ? "初始密码不会写入下载文件。" : "The initial password is never written to the download."}</span></div>
            {(importIssue || mutationError) && <p className="admin-inline-error" role="alert">{importIssue || adminErrorCopy(locale, mutationError?.message ?? "FORM_INVALID")}</p>}
            {importPreview.length > 0 && <div className="admin-import-preview"><div><b>{locale === "zh" ? "校验结果" : "Validation result"}</b><span><AdminBadge tone={importPreview.some((row) => row.errors.length > 0) ? "red" : "green"}>{importPreview.filter((row) => row.errors.length === 0).length} / {importPreview.length}</AdminBadge></span></div><div className="table-wrap"><table className="admin-table admin-import-preview-table"><thead><tr><th>{locale === "zh" ? "行" : "Line"}</th><th>{adminCopy(locale, "employee_number")}</th><th>{adminCopy(locale, "name")}</th><th>{locale === "zh" ? "邮箱" : "Email"}</th><th>{adminCopy(locale, "status")}</th></tr></thead><tbody>{importPreview.map((row) => <tr key={`${row.line}-${row.input.account}`}><td>{row.line}</td><td><code>{row.input.account || "—"}</code></td><td>{row.input.name || "—"}</td><td>{row.input.email || "—"}</td><td>{row.errors.length === 0 ? <AdminBadge tone="green">{locale === "zh" ? "可建立" : "Ready"}</AdminBadge> : <span className="admin-row-error">{row.errors.map((code) => adminErrorCopy(locale, code)).join("；")}</span>}</td></tr>)}</tbody></table></div></div>}
          </div>
        </AdminDialog>
      )}

      {deleteTarget && (
        <AdminDialog
          locale={locale}
          title={locale === "zh" ? "删除教师账号" : "Delete teacher account"}
          description={`${deleteTarget.teacher.fullName} · ${deleteTarget.teacher.employeeNumber}`}
          close={() => { if(deletingTeacher||teacherDeleteIntent.current)return;setDeleteTarget(null); setDeleteReason(""); setDeleteConfirmation(""); clearError(); }}
          dirty={Boolean(deleteReason || deleteConfirmation)}
          footer={<><button className="secondary-button" type="button" disabled={deletingTeacher||teacherDeletePending} onClick={() => { setDeleteTarget(null); setDeleteReason(""); setDeleteConfirmation(""); clearError(); }}>{adminCopy(locale, "cancel")}</button><button className="danger-button" type="button" disabled={deletingTeacher || Boolean(busyKey) || (mode==='demo'&&deleteTarget.assignedCourseCount > 0) || !deleteReason.trim() || deleteConfirmation.trim() !== deleteTarget.teacher.employeeNumber} onClick={() => void confirmTeacherDelete()}>{deletingTeacher||busyKey?.startsWith("teacher-delete-") ? (locale === "zh" ? "删除中…" : "Deleting…") : (locale === "zh" ? "确认删除账号" : "Delete account")}</button></>}
        >
          <div className="admin-teacher-delete-form">
            <p>{locale==='zh'?'确认后立即删除教师账号并关闭其全部未关闭课程，无需等待教学或结算完成。':'Confirmation deletes the teacher and closes all open courses without waiting for teaching or settlement.'}</p>
            {teacherDeleteError&&<ErrorPanel error={teacherDeleteError} locale={locale}/>}
            {teacherDeletePending&&!deletingTeacher&&<p role="status">{locale==='zh'?'上次删除结果尚未确认，请按原内容重试核对结果。':'The previous result is unconfirmed. Retry the same request to check it.'}</p>}
            <aside className="admin-cascade-warning" role="alert"><b>{locale === "zh" ? "删除教师登录账号并结束其课程成员关系。学生账号、全部课程历史、打卡、审核、学时、申请、成绩及照片视频均保留。" : "The teacher login is deleted and memberships end. All student accounts, course history, check-ins, reviews, credits, applications, grades, photos and videos are retained."}</b></aside>
            <AdminField locale={locale} label={locale === "zh" ? "删除原因" : "Deletion reason"} required errorCode={mutationError?.fieldErrors.reason}><textarea disabled={deletingTeacher||teacherDeletePending} value={deleteReason} placeholder={locale === "zh" ? "说明删除教师账号的原因" : "Explain why this teacher account is being deleted"} onChange={(event) => { setDeleteReason(event.target.value); clearError(); }} /></AdminField>
            <AdminField locale={locale} label={locale === "zh" ? `输入工号 ${deleteTarget.teacher.employeeNumber} 确认` : `Enter ${deleteTarget.teacher.employeeNumber} to confirm`} required errorCode={mutationError?.fieldErrors.confirmationAccount}><input disabled={deletingTeacher||teacherDeletePending} value={deleteConfirmation} autoComplete="off" onChange={(event) => { setDeleteConfirmation(event.target.value); clearError(); }} /></AdminField>
            {mutationError && <p className="admin-inline-error" role="alert">{adminErrorCopy(locale, mutationError.message)}</p>}
          </div>
        </AdminDialog>
      )}
    </div>
  );
}

function courseAssociationText(student: StudentProfileProjection, locale: AdminLocale) {
  return (student.courseAssociations ?? []).map(item => `${item.semesterName} · ${item.courseName} · ${item.className} (${item.classCode}) · ${item.status === "ACTIVE" ? (locale === "zh" ? "在课" : "Enrolled") : (locale === "zh" ? "历史" : "Historical")}`).join("；") || (locale === "zh" ? "暂无课程关联" : "No course associations");
}

function StudentDrawer({ locale, student, close, onDelete, onCorrected }: { locale: AdminLocale; student: StudentProfileProjection; close: () => void; onDelete?: () => void; onCorrected?:()=>void }) {
  return (
    <AdminDrawer locale={locale} title={student.fullName} description={student.studentNumber} close={close} footer={onDelete ? <button className="danger-button" type="button" onClick={onDelete}>{locale === "zh" ? "删除学生账号" : "Delete student account"}</button> : undefined}>
      <div className="admin-detail-list">
        <Detail label={adminCopy(locale, "user_id")} value={student.userId} />
        {"email" in student && <Detail label={locale === "zh" ? "邮箱" : "Email"} value={student.email ?? (locale === "zh" ? "尚未绑定" : "Not bound")} />}
        <Detail label={adminCopy(locale, "organization")} value={student.organizationId} />
        <Detail label={locale === "zh" ? "出生日期" : "Date of birth"} value={student.dateOfBirth} />
        <Detail label={locale === "zh" ? "生源地" : "Region"} value={adminStudentRegion(student, locale)} />
        <Detail label={locale === "zh" ? "注册时间" : "Registered"} value={formatAdminDate(locale,student.createdAt,true)} />
        <Detail label={locale === "zh" ? "课程/教学班（含历史）" : "Courses/classes (including history)"} value={courseAssociationText(student,locale)} />
        <Detail label={locale === "zh" ? "邮箱验证" : "Email verification"} value={student.emailVerified === undefined ? "—" : student.emailVerified ? (locale === "zh" ? "已验证" : "Verified") : (locale === "zh" ? "未验证" : "Unverified")} />
        <Detail label={adminCopy(locale, "gender")} value={student.gender} />
        <Detail label={adminCopy(locale, "grade_year")} value={student.gradeYear} />
        <Detail label={adminCopy(locale, "college")} value={student.collegeName} />
        <Detail label={adminCopy(locale, "major")} value={student.majorName} />
        {onCorrected && <StudentMajorCorrection student={student} locale={locale} onSaved={onCorrected}/>}
        <Detail label={adminCopy(locale, "status")} value={`${student.status} · ${student.status === "ACTIVE" ? (locale === "zh" ? "已进班" : "Enrolled") : (locale === "zh" ? "已绑定邮箱但已退班" : "Email-bound but withdrawn")}`} />
        <Detail label={adminCopy(locale, "updated_at")} value={formatAdminDate(locale, student.updatedAt, true)} />
        <Detail label={adminCopy(locale, "record_version")} value={student.version} />
      </div>
    </AdminDrawer>
  );
}

function TeacherDrawer({ locale, teacher, mode, assignedCourseCount, close, onDelete }: { locale: AdminLocale; teacher: TeacherProfileProjection; mode: "demo" | "real"; assignedCourseCount: number; close: () => void; onDelete: () => void }) {
  const deletionBlocked = assignedCourseCount > 0;
  return <AdminDrawer locale={locale} title={teacher.fullName} description={teacher.employeeNumber} close={close} footer={<div className="admin-drawer-actions admin-teacher-drawer-actions"><span>{locale === "zh" ? "删除将关闭课程并解除在课关系，保留学生账号及全部历史。" : "Deletion closes courses and ends memberships while retaining student accounts and all history."}</span><button className="danger-button" type="button" disabled={mode==='demo'&&deletionBlocked} onClick={onDelete}>{locale === "zh" ? "删除教师账号" : "Delete account"}</button></div>}>
    <div className="admin-detail-list">
      <Detail label={adminCopy(locale, "user_id")} value={teacher.userId} />
      {"email" in teacher && <Detail label={locale === "zh" ? "邮箱" : "Email"} value={teacher.email ?? (locale === "zh" ? "尚未绑定" : "Not bound")} />}
      <Detail label={adminCopy(locale, "organization")} value={teacher.organizationId} />
      <Detail label={adminCopy(locale, "college")} value={teacher.collegeName} />
      <Detail label={adminCopy(locale, "department")} value={teacher.departmentName} />
      <Detail label={adminCopy(locale, "job_title")} value={teacher.title} />
      <Detail label={adminCopy(locale, "status")} value={teacher.status} />
      <Detail label={adminCopy(locale, "updated_at")} value={formatAdminDate(locale, teacher.updatedAt, true)} />
      <Detail label={adminCopy(locale, "record_version")} value={teacher.version} />
    </div>
  </AdminDrawer>;
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <span><small>{label}</small><b>{value ?? "—"}</b></span>;
}

function qualityLabel(value:string,locale:AdminLocale) {
  const labels:Record<string,[string,string]>={all:['全部','All'],NORMAL:['正常','Normal'],REQUIRES_PROFILE_UPDATE:['必须完善','Correction required'],PENDING_REVIEW:['待核查','Review needed']};
  return labels[value]?.[locale==='zh'?0:1] ?? value;
}
function qualityReason(value:string,locale:AdminLocale) {
  if(value.startsWith('manual:')) return value.slice(7);
  const labels:Record<string,[string,string]>={studentNumber:['学号格式','Student number'],fullName:['姓名格式','Name'],gender:['性别','Gender'],gradeYear:['入学年份','Admission year'],collegeName:['学院','College'],majorName:['专业','Major'],dateOfBirth:['出生日期','Birth date'],regionCode:['生源地','Region'],'fullName.review':['姓名需确认','Confirm name']};
  return labels[value]?.[locale==='zh'?0:1] ?? value;
}
