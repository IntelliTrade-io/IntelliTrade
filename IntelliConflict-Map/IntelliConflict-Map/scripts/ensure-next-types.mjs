import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const requiredFiles = [
  path.join(projectRoot, ".next", "types", "app", "layout.ts"),
  path.join(projectRoot, ".next", "types", "app", "page.ts"),
  path.join(
    projectRoot,
    ".next",
    "types",
    "app",
    "api",
    "conflicts",
    "route.ts"
  )
];

await Promise.all(
  requiredFiles.map(async (filePath) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "export {};\n", "utf8");
  })
);
