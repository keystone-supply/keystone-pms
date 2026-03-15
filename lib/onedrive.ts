/** Microsoft Graph: create project folders in OneDrive, upload tape exports to project _DOCS. */
export async function createProjectFolders(
  accessToken: string,
  customer: string,
  projectNumber: string,
  projectName: string,
) {
  const customerUpper = customer
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9 ]/g, "");
  const projectUpper = projectName
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9 ]/g, "");
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
    `${projectNumber}_G-CODE`,
  ];

  for (const sub of subfolders) {
    await ensureFolder(headers, `${currentPath}/${sub}`);
  }

  console.log("=== PERSONAL DOCUMENTS DEBUG END ===");
  return `Documents/0 PROJECT FOLDERS/${customerUpper}/${folderName}`;
}

export async function ensureFolder(headers: any, fullPath: string) {
  const parts = fullPath.split("/");
  const parentPath = parts.slice(0, -1).join("/") || "";
  const name = parts[parts.length - 1];

  let url;
  if (parentPath === "") {
    url = `https://graph.microsoft.com/v1.0/me/drive/root/children`;
  } else {
    url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(parentPath)}:/children`;
  }

  const body = JSON.stringify({ name, folder: {} });

  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text().catch(() => "no body");

  if (!res.ok && res.status !== 409) {
    throw new Error(`Failed for "${name}": ${res.status} ${text}`);
  }
  return res.status === 409 ? "already exists" : "created";
}

// Upload tape exports to Documents/0 PROJECT FOLDERS/{customerUpper}/{projectFolder}/{projectNumber}_DOCS/{filename}
// Matches createProjectFolders structure
export async function uploadTapeToDocs(
  accessToken: string,
  customer: string,
  projectNumber: string,
  projectName: string,
  filename: string,
  content: string,
) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  const uploadHeaders = {
    Authorization: `Bearer ${accessToken}`,
  };

  console.log(
    `📁 Ensuring project folders for ${projectNumber} (${customer})...`,
  );

  // Replicate createProjectFolders base path
  const customerUpper = customer
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9 ]/g, "");
  const projectUpper = projectName
    .toUpperCase()
    .trim()
    .replace(/[^A-Z0-9 ]/g, "");
  const folderName = `${projectNumber} - ${projectUpper}`;

  const baseSegments = ["0 PROJECT FOLDERS", customerUpper, folderName];
  let currentPath = "Documents";
  for (const segment of baseSegments) {
    currentPath += "/" + segment;
    await ensureFolder(headers, currentPath);
  }

  // Ensure _DOCS subfolder
  const docsFolderPath = `${currentPath}/${projectNumber}_DOCS`;
  await ensureFolder(headers, docsFolderPath);

  // Version control: Check if plain filename exists or find highest version to avoid overwrite
  const normalizedFilename = filename.replace(/ \(v\d+\)\.txt$/, ".txt");
  if (!normalizedFilename.toLowerCase().endsWith(".txt")) {
    throw new Error("Filename must end with .txt");
  }
  const baseNoExt = normalizedFilename.slice(0, -4);
  const plainFilename = normalizedFilename;
  const listUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(docsFolderPath)}:/children`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) {
    const listText = await listRes.text();
    throw new Error(
      `Failed to list ${docsFolderPath}: ${listRes.status} ${listText}`,
    );
  }
  const listData = await listRes.json();
  let highestVersion = 0;
  let plainExists = false;
  if (listData.value) {
    for (const item of listData.value) {
      if (item.name === plainFilename) {
        plainExists = true;
      } else if (item.name.toLowerCase().endsWith(".txt")) {
        const escapedBase = baseNoExt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`^${escapedBase} \\(v(\\d+)\\)\\.txt$`);
        const match = item.name.match(regex);
        if (match) {
          highestVersion = Math.max(highestVersion, parseInt(match[1], 10));
        }
      }
    }
  }
  const version = plainExists || highestVersion > 0 ? highestVersion + 1 : 0;
  const finalFilename =
    version === 0 ? plainFilename : `${baseNoExt} (v${version}).txt`;
  const fullPath = `${docsFolderPath}/${finalFilename}`;
  const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(fullPath)}:/content`;

  console.log(
    `📤 Uploading to: ${fullPath} ${version > 1 ? `(v${version})` : ""}`,
  );

  const res = await fetch(url, {
    method: "PUT",
    headers: uploadHeaders,
    body: content,
  });

  console.log(`Upload response: status=${res.status}, ok=${res.ok}`);

  const text = await res.text().catch(() => "no body");
  console.log(`Upload body: ${text.slice(0, 500)}`);

  if (!res.ok) {
    throw new Error(`Upload failed for "${fullPath}": ${res.status} ${text}`);
  }

  console.log(`✅ Uploaded successfully: ${fullPath}`);
  return fullPath;
}
