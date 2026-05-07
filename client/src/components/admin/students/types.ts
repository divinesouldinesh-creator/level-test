export type StudentPreviewRow = {
  fullName: string;
  studentLoginId: string;
  password: string;
  classId: string;
  sectionId: string;
  className: string;
  classLabel?: string;
  sectionName: string;
};

export type StudentListRow = {
  id: string;
  userId: string;
  fullName: string;
  classId: string;
  sectionId: string;
  className: string;
  classLabel: string;
  sectionName: string;
  username: string;
  password: string;
};
