export function rosterIntuitiveBrowser(input: {
  baseUrl: string;
  sectionId: string;
  email: string;
  password: string;
  joinMissing: () => Promise<void>;
}): Promise<void>;
