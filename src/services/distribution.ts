export const STRYKER_RELEASE_URL = "https://github.com/Itsadam99/stryker-football-life/releases/latest";
export const STRYKER_DOWNLOAD_URL = `${STRYKER_RELEASE_URL}/download/STRYKER-Setup-x64.exe`;

export function createStrykerInstallLink(modId: string, repositoryUrl = "") {
  const link = new URL(`stryker://install/${encodeURIComponent(modId)}`);
  if (repositoryUrl) link.searchParams.set("repository", repositoryUrl);
  return link.href;
}
