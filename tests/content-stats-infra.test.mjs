import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { renderInfra } from "../scripts/render-infra.mjs";

const rendered = JSON.parse(renderInfra());
const resources = rendered.Resources;

function entriesOfType(type) {
  return Object.entries(resources).filter(([, resource]) => resource.Type === type);
}

function oneOfType(type) {
  const matches = entriesOfType(type);
  assert.equal(matches.length, 1, `expected one ${type} resource`);
  return matches[0];
}

function statementsIn(value) {
  const statements = [];
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (Array.isArray(node.Statement)) statements.push(...node.Statement);
    for (const child of Object.values(node)) visit(child);
  }
  visit(value);
  return statements;
}

function actionList(statement) {
  return (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).filter(Boolean);
}

function referencesResource(value, logicalId) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => referencesResource(item, logicalId));
  if (value.Ref === logicalId) return true;
  if (Array.isArray(value["Fn::GetAtt"]) && value["Fn::GetAtt"][0] === logicalId) return true;
  const substitution = Array.isArray(value["Fn::Sub"]) ? value["Fn::Sub"][0] : value["Fn::Sub"];
  if (typeof substitution === "string" && new RegExp(`\\$\\{${logicalId}(?:\\.[A-Za-z0-9]+)?\\}`).test(substitution)) return true;
  return Object.values(value).some((child) => referencesResource(child, logicalId));
}

function roleTrustedBy(service) {
  return Object.entries(resources).filter(([logicalId, resource]) => {
    if (resource.Type !== "AWS::IAM::Role") return false;
    const trust = JSON.stringify(resource.Properties?.AssumeRolePolicyDocument ?? {});
    return trust.includes(service) && trust.includes("sts:AssumeRole");
  });
}

function policyStatementsForRole(role) {
  return statementsIn(role.Properties?.Policies ?? []);
}

function hasAction(statement, action) {
  return actionList(statement).includes(action);
}

test("the rendered template embeds the real collector and one bounded daily collection path", () => {
  const collectorPath = new URL("../infra/content-stats-collector.cjs", import.meta.url);
  assert.ok(existsSync(collectorPath), "expected the collector source at infra/content-stats-collector.cjs");
  const collectorSource = readFileSync(collectorPath, "utf8").trimEnd() + "\n";

  const [collectorId, collector] = oneOfType("AWS::Lambda::Function");
  assert.equal(collector.Properties.Runtime, "nodejs24.x");
  assert.equal(collector.Properties.Handler, "index.handler");
  assert.equal(collector.Properties.Timeout, 300);
  assert.equal(collector.Properties.ReservedConcurrentExecutions, 1);
  assert.equal(collector.Properties.Code.ZipFile, collectorSource, "Lambda must embed the actual collector source");
  const environment = collector.Properties.Environment?.Variables ?? {};
  const [bucketId] = oneOfType("AWS::S3::Bucket");
  assert.ok(referencesResource(environment.STATS_BUCKET, bucketId), "collector must reuse the existing site bucket");
  assert.equal(environment.STATS_INPUT_KEY, "_content-stats/inputs.json");
  assert.equal(environment.STATS_OUTPUT_KEY, "content-stats/v1/current.json");

  const [, schedule] = oneOfType("AWS::Scheduler::Schedule");
  assert.equal(schedule.Properties.ScheduleExpression, "cron(15 9 * * ? *)");
  assert.equal(schedule.Properties.ScheduleExpressionTimezone, "America/Argentina/Cordoba");
  assert.deepEqual(schedule.Properties.FlexibleTimeWindow, { Mode: "OFF" });
  assert.ok(referencesResource(schedule.Properties.Target?.Arn, collectorId), "daily schedule must invoke the collector");
  assert.equal(schedule.Properties.Target?.RetryPolicy?.MaximumRetryAttempts, 1);
  assert.equal(schedule.Properties.Target?.RetryPolicy?.MaximumEventAgeInSeconds, 3600);

  const [, eventInvokeConfig] = oneOfType("AWS::Lambda::EventInvokeConfig");
  assert.ok(referencesResource(eventInvokeConfig.Properties.FunctionName, collectorId));
  assert.equal(eventInvokeConfig.Properties.MaximumRetryAttempts, 1);
  assert.equal(eventInvokeConfig.Properties.MaximumEventAgeInSeconds, 3600);

  const [, logGroup] = oneOfType("AWS::Logs::LogGroup");
  assert.equal(logGroup.Properties.RetentionInDays, 30);
  assert.ok(JSON.stringify(logGroup.Properties).includes(collectorId), "log group must be associated with the collector");
});

test("collector and scheduler roles grant only their required object and invoke access", () => {
  const collectorRoles = roleTrustedBy("lambda.amazonaws.com");
  assert.equal(collectorRoles.length, 1, "expected one Lambda execution role");
  const [collectorRoleId, collectorRole] = collectorRoles[0];
  const collectorStatements = policyStatementsForRole(collectorRole);
  const s3Statements = collectorStatements.filter((statement) => actionList(statement).some((action) => action.startsWith("s3:")));
  const reads = collectorStatements.filter((statement) => hasAction(statement, "s3:GetObject"));
  const writes = collectorStatements.filter((statement) => hasAction(statement, "s3:PutObject"));
  const [collectorId, collector] = oneOfType("AWS::Lambda::Function");
  const [bucketId] = oneOfType("AWS::S3::Bucket");
  assert.ok(referencesResource(collector.Properties.Role, collectorRoleId), "Lambda must use the inspected execution role");
  assert.equal(s3Statements.length, 2, "collector should have no other S3 permissions");
  assert.equal(reads.length, 1, "collector should have one input read grant");
  assert.equal(writes.length, 1, "collector should have one aggregate write grant");
  assert.equal(reads[0].Effect, "Allow");
  assert.equal(writes[0].Effect, "Allow");
  assert.ok(referencesResource(reads[0].Resource, bucketId), "input grant must use the existing site bucket");
  assert.ok(referencesResource(writes[0].Resource, bucketId), "output grant must use the existing site bucket");
  assert.ok(JSON.stringify(reads[0].Resource).includes("/_content-stats/inputs.json"));
  assert.ok(JSON.stringify(writes[0].Resource).includes("/content-stats/v1/current.json"));
  assert.ok(!JSON.stringify(reads[0].Resource).includes("*"), "input access must name the exact protected object");
  assert.ok(!JSON.stringify(writes[0].Resource).includes("*"), "output access must name the exact aggregate object");
  assert.equal(collectorStatements.some((statement) => actionList(statement).includes("s3:ListBucket")), false);

  const logActions = new Set(["logs:CreateLogStream", "logs:PutLogEvents"]);
  const logging = collectorStatements.filter((statement) => actionList(statement).some((action) => logActions.has(action)));
  const grantedLogActions = new Set(logging.flatMap(actionList));
  for (const action of logActions) assert.ok(grantedLogActions.has(action), `collector must be able to ${action}`);
  assert.ok(logging.every((statement) => statement.Effect === "Allow"));
  assert.ok(logging.every((statement) => actionList(statement).every((action) => logActions.has(action))));
  assert.ok(logging.every((statement) => JSON.stringify(statement.Resource).includes("/aws/lambda/")));

  const schedulerRoles = roleTrustedBy("scheduler.amazonaws.com");
  assert.equal(schedulerRoles.length, 1, "expected one Scheduler target role");
  const [schedulerRoleId, schedulerRole] = schedulerRoles[0];
  const schedulerStatements = policyStatementsForRole(schedulerRole);
  const [, schedule] = oneOfType("AWS::Scheduler::Schedule");
  assert.ok(referencesResource(schedule.Properties.Target.RoleArn, schedulerRoleId), "schedule must use the inspected Scheduler role");
  assert.equal(schedulerStatements.length, 1, "Scheduler role should grant no unrelated permissions");
  const invokes = schedulerStatements.filter((statement) => hasAction(statement, "lambda:InvokeFunction"));
  assert.equal(invokes.length, 1, "Scheduler should have one collector invoke grant");
  assert.equal(invokes[0].Effect, "Allow");
  assert.deepEqual(actionList(invokes[0]), ["lambda:InvokeFunction"]);
  assert.ok(referencesResource(invokes[0].Resource, collectorId));
  assert.ok(!JSON.stringify(invokes[0].Resource).includes("*"), "Scheduler invoke access must name the collector");
});

test("CloudFront and site CI are explicitly denied access to collector-owned objects", () => {
  const bucketPolicies = entriesOfType("AWS::S3::BucketPolicy");
  assert.equal(bucketPolicies.length, 1, "expected the existing bucket policy to be extended");
  const bucketStatements = statementsIn(bucketPolicies[0][1].Properties.PolicyDocument);
  const protectedInputDenies = bucketStatements.filter((statement) => {
    const text = JSON.stringify(statement);
    return statement.Effect === "Deny" && hasAction(statement, "s3:GetObject") &&
      text.includes("_content-stats/*") && text.includes("cloudfront.amazonaws.com");
  });
  assert.equal(protectedInputDenies.length, 1, "CloudFront needs an explicit deny for protected inputs");
  assert.ok(JSON.stringify(protectedInputDenies[0].Condition).includes("SiteDistribution"));

  const deploymentRoles = Object.entries(resources).filter(([, resource]) => {
    if (resource.Type !== "AWS::IAM::Role") return false;
    return JSON.stringify(resource.Properties?.AssumeRolePolicyDocument ?? {}).includes("token.actions.githubusercontent.com");
  });
  assert.equal(deploymentRoles.length, 1, "expected the existing GitHub deployment role");
  const ciStatements = policyStatementsForRole(deploymentRoles[0][1]);
  const publicOutputDenies = ciStatements.filter((statement) => {
    return statement.Effect === "Deny" && hasAction(statement, "s3:PutObject") &&
      JSON.stringify(statement.Resource).includes("/content-stats/*");
  });
  assert.equal(publicOutputDenies.length, 1, "site CI needs an explicit deny for collector output");

  const unnecessaryResourceTypes = Object.values(resources).map((resource) => resource.Type).filter((type) =>
    /AWS::(?:SSM::Parameter|SecretsManager::Secret|Cognito::|ApiGateway::Authorizer|ApiGateway::ApiKey)/.test(type)
  );
  assert.deepEqual(unnecessaryResourceTypes, [], "Phase 1 does not need credential or authorization resources");
});

test("the existing private site bucket, distribution, and routing remain attached", () => {
  const [bucketId] = oneOfType("AWS::S3::Bucket");
  const [distributionId, distribution] = oneOfType("AWS::CloudFront::Distribution");
  const routingFunctions = entriesOfType("AWS::CloudFront::Function");
  assert.equal(routingFunctions.length, 1, "the existing language routing function must remain");
  const [routingFunctionId, routingFunction] = routingFunctions[0];
  const routingSource = readFileSync(new URL("../infra/cloudfront-routing.js", import.meta.url), "utf8").trimEnd() + "\n";
  assert.equal(routingFunction.Properties.FunctionCode, routingSource);
  assert.ok(referencesResource(distribution.Properties.DistributionConfig.Origins, bucketId));
  assert.ok(referencesResource(distribution.Properties.DistributionConfig.DefaultCacheBehavior.FunctionAssociations, routingFunctionId));
  assert.ok(resources[distributionId]);
});
