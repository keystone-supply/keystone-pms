export async function createProjectFolders(accessToken: string, customer: string, projectNumber: string, projectName: string) {
  const customerUpper = customer.toUpperCase().trim().replace(/[^A-Z0-9 ]/g, '');
  const projectUpper = projectName.toUpperCase().trim().replace(/[^A-Z0-9 ]/g, '');
  const folderName = `${projectNumber} - ${projectUpper}`;

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  console.log("=== PERSONAL DOCUMENTS DEBUG START ===");

  // Start in your personal Documents folder (you own this 100%)
  const baseSegments = ["0 PROJECT FOLDERS", customerUpper, folderName];
  let currentPath = "Documents";

  for (const segment of baseSegments) {
    currentPath += "/" + segment;
    await ensureFolder(headers, currentPath);
  }

  const subfolders = [
    `${projectNumber}_CAD`,
    `${projectNumber}_VENDORS`,
    `${projectNumber}_PICS`,
    `${projectNumber}_DOCS`,
    `${projectNumber}_MACHINING`,
    `${projectNumber}_G-CODE`
  ];

  for (const sub of subfolders) {
    await ensureFolder(headers, `${currentPath}/${sub}`);
  }

  console.log("=== PERSONAL DOCUMENTS DEBUG END ===");
  return `Documents/0 PROJECT FOLDERS/${customerUpper}/${folderName}`;
}

async function ensureFolder(headers: any, fullPath: string) {
  const parts = fullPath.split('/');
  const parentPath = parts.slice(0, -1).join('/') || "";
  const name = parts[parts.length - 1];

  const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(parentPath)}:/children`;

  const body = JSON.stringify({ name, folder: {} });

  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text().catch(() => "no body");

  if (!res.ok && res.status !== 409) {
    throw new Error(`Failed for "${name}": ${res.status} ${text}`);
  }
  return res.status === 409 ? "already exists" : "created";
}
