import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = resolve(scriptsDirectory, "..");
const defaultTemplatePath = resolve(repositoryDirectory, "infra/template.json");
const defaultFunctionPath = resolve(repositoryDirectory, "infra/cloudfront-routing.js");

/**
 * Render the deployable CloudFormation template from the readable source
 * template and the authoritative CloudFront Function source.
 */
export function renderInfra({
  templatePath = defaultTemplatePath,
  functionPath = defaultFunctionPath
} = {}) {
  const template = JSON.parse(readFileSync(templatePath, "utf8"));
  const functionCode = readFileSync(functionPath, "utf8").trimEnd() + "\n";
  const functionResource = template.Resources?.SiteRouteFunction;

  if (!functionResource || functionResource.Properties?.FunctionCode !== "__CLOUDFRONT_FUNCTION_CODE__") {
    throw new Error("infra/template.json must contain the CloudFront Function code marker");
  }

  functionResource.Properties.FunctionCode = functionCode;
  const rendered = `${JSON.stringify(template, null, 2)}\n`;

  // Parse the final document as a last guard against malformed embedded code.
  JSON.parse(rendered);
  return rendered;
}

function outputPathFromArgs(args) {
  const outputFlagIndex = args.findIndex((argument) => argument === "--output" || argument === "-o");
  if (outputFlagIndex === -1) {
    return null;
  }

  const outputPath = args[outputFlagIndex + 1];
  if (!outputPath || outputPath.startsWith("-")) {
    throw new Error("--output requires a file path");
  }
  return resolve(process.cwd(), outputPath);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const rendered = renderInfra();
    const outputPath = outputPathFromArgs(process.argv.slice(2));
    if (outputPath) {
      writeFileSync(outputPath, rendered, "utf8");
      process.stdout.write(`${outputPath}\n`);
    } else {
      process.stdout.write(rendered);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
