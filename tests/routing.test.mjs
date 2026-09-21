import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { renderInfra } from "../scripts/render-infra.mjs";

const routingSource = readFileSync(new URL("../infra/cloudfront-routing.js", import.meta.url), "utf8");
const sandbox = {};
vm.runInNewContext(`${routingSource}\nthis.routeHandler = handler;`, sandbox);
const route = sandbox.routeHandler;

function request(uri, rawQueryString) {
  const requestObject = {
    method: "GET",
    uri,
    querystring: {}
  };
  if (rawQueryString !== undefined) {
    requestObject.rawQueryString = () => rawQueryString;
  } else {
    requestObject.rawQueryString = () => undefined;
  }
  return { request: requestObject };
}

test("the production routing function serves both language roots internally", () => {
  const english = route(request("/"));
  const spanish = route(request("/es/"));

  assert.equal(english.uri, "/index.html");
  assert.equal(spanish.uri, "/es/index.html");
});

test("the /es redirect keeps repeated, encoded, and empty query values", () => {
  const result = route(request("/es", "flag&topic=one&topic=AI%20agents&empty="));

  assert.equal(result.statusCode, 301);
  assert.equal(result.headers.location.value, "/es/?flag&topic=one&topic=AI%20agents&empty=");
});

test("the production helper distinguishes no query from an explicitly empty query", () => {
  assert.equal(route(request("/es")).headers.location.value, "/es/");
  assert.equal(route(request("/es", "")).headers.location.value, "/es/?");
});

test("assets and unknown routes pass through to CloudFront and S3", () => {
  const asset = request("/_astro/site.12345678.js");
  const unknown = request("/missing-page");

  assert.equal(route(asset), asset.request);
  assert.equal(route(unknown), unknown.request);
  assert.equal(asset.request.uri, "/_astro/site.12345678.js");
  assert.equal(unknown.request.uri, "/missing-page");
});

test("rendering embeds the same routing source into the deployable template", () => {
  const rendered = JSON.parse(renderInfra());
  const functionCode = rendered.Resources.SiteRouteFunction.Properties.FunctionCode;

  assert.equal(functionCode, `${routingSource.trimEnd()}\n`);
  assert.equal(rendered.Resources.SiteDistribution.Properties.DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy, "redirect-to-https");
  assert.equal(rendered.Resources.SiteCachePolicy.Properties.CachePolicyConfig.MinTTL, 0);
  assert.deepEqual(rendered.Resources.SiteDistribution.Properties.DistributionConfig.ViewerCertificate, {
    CloudFrontDefaultCertificate: true
  });
  assert.equal(rendered.Resources.SiteDistribution.Properties.DistributionConfig.CustomErrorResponses[0].ResponseCode, 404);
});
