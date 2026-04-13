// Checks for usage of @deprecated symbols using TypeScript's suggestion diagnostics.
// This is the same mechanism editors use to show strikethroughs.
const ts = require('typescript');
const path = require('path');

const configPaths = ['tsconfig.node.json', 'tsconfig.web.json'];
let hasErrors = false;

for (const configPath of configPaths) {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    console.error(`Failed to read ${configPath}`);
    process.exit(1);
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(path.resolve(configPath)),
  );

  const serviceHost = {
    getScriptFileNames: () => parsedConfig.fileNames,
    getScriptVersion: () => '0',
    getScriptSnapshot: (fileName) => {
      const content = ts.sys.readFile(fileName);
      if (content === undefined) return undefined;
      return ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => process.cwd(),
    getCompilationSettings: () => parsedConfig.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };

  const service = ts.createLanguageService(
    serviceHost,
    ts.createDocumentRegistry(),
  );

  for (const fileName of parsedConfig.fileNames) {
    if (fileName.includes('node_modules')) continue;

    const diagnostics = service.getSuggestionDiagnostics(fileName);

    for (const diag of diagnostics) {
      // 6385: "'{0}' is deprecated."
      // 6387: "The signature '(...)' of '{0}' is deprecated."
      if (diag.code === 6385 || diag.code === 6387) {
        const { line, character } = ts.getLineAndCharacterOfPosition(
          diag.file,
          diag.start,
        );
        const message = ts.flattenDiagnosticMessageText(
          diag.messageText,
          '\n',
        );
        const relPath = path.relative(process.cwd(), fileName);
        console.error(`${relPath}:${line + 1}:${character + 1} - ${message}`);
        hasErrors = true;
      }
    }
  }
}

if (hasErrors) {
  process.exit(1);
}
