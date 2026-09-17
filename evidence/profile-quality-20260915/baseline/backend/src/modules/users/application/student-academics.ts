// Confirmed enrollment choices, 2026-09-15. Do not rewrite historical profiles.
const majors: Record<string, readonly string[]> = {
  FBM: 'ACCT FIN AE BUSA MHR MKT EBIS EPIN DMM'.split(' '),
  FHSS: 'CCGC MCOM PRA ATS ELLS DIS TDH DGS GAD'.split(' '),
  FST: 'AM FM STAT DS AI CST ENVS FS APSY'.split(' '),
  SCC: 'CCM MAD THEM AIM CTV GD MUS'.split(' '),
};
export const STUDENT_COLLEGE_CODES = ['FBM', 'FHSS', 'FST', 'SCC', 'SAI', 'SGE', 'GS'];
export function validAcademicDetails(college: string, major: string): boolean {
  if (!/^[A-Z]{1,200}$/.test(major)) return false;
  if (college === 'SGE' || college === 'GS') return true;
  const allowed = college === 'SAI' ? Object.values(majors).flat() : majors[college];
  return allowed?.includes(major) ?? false;
}
