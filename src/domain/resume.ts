export type ResumeSelection = {
  id?: string | undefined;
  title?: string | undefined;
};

export type ResumeSummary = {
  id: string;
  title: string;
};

export type ResumeContent = ResumeSummary & {
  url: string;
  position?: string;
  experience?: string;
  skills?: string;
  education?: string;
  about?: string;
};
