// Confirmed enrollment choices, 2026-09-15. Existing stored profiles remain readable.
export const STUDENT_COLLEGES = [
  {
    "code": "FBM",
    "name": "工商管理学院",
    "majors": [
      "ACCT",
      "FIN",
      "AE",
      "BUSA",
      "MHR",
      "MKT",
      "EBIS",
      "EPIN",
      "DMM"
    ]
  },
  {
    "code": "FHSS",
    "name": "人文社科学院",
    "majors": [
      "CCGC",
      "MCOM",
      "PRA",
      "ATS",
      "ELLS",
      "DIS",
      "TDH",
      "DGS",
      "GAD"
    ]
  },
  {
    "code": "FST",
    "name": "理工科技学院",
    "majors": [
      "AM",
      "FM",
      "STAT",
      "DS",
      "AI",
      "CST",
      "ENVS",
      "FS",
      "APSY"
    ]
  },
  {
    "code": "SCC",
    "name": "文化与创意学院",
    "majors": [
      "CCM",
      "MAD",
      "THEM",
      "AIM",
      "CTV",
      "GD",
      "MUS",
      "JC"
    ]
  },
  {
    "code": "SAI",
    "name": "博雅智能学院",
    "majors": []
  },
  {
    "code": "SGE",
    "name": "通识教育学院",
    "majors": []
  },
  {
    "code": "GS",
    "name": "研究生院",
    "majors": []
  }
];
export function academicMajorOptions(college) {
  const options = college === 'SAI' ? STUDENT_COLLEGES.flatMap(item => item.majors) : STUDENT_COLLEGES.find(item => item.code === college)?.majors || [];
  return STUDENT_COLLEGES.some(item=>item.code===college) ? ['未分流', ...options] : [];
}
export const allowsCustomMajor = college => ['SGE', 'GS'].includes(college);
export function validAcademicDetails(college, major) {
  if (major === '未分流') return STUDENT_COLLEGES.some(item=>item.code===college);
  return /^[A-Z]{1,200}$/.test(major) && (allowsCustomMajor(college) || academicMajorOptions(college).includes(major));
}
