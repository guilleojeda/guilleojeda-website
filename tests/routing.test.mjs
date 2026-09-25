import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { renderInfra } from "../scripts/render-infra.mjs";

const routingSource = readFileSync(new URL("../infra/cloudfront-routing.js", import.meta.url), "utf8");
const sandbox = {};
vm.runInNewContext(`${routingSource}\nthis.routeHandler = handler;`, sandbox);
const route = sandbox.routeHandler;

function request(uri, rawQueryString, host) {
  const requestObject = {
    method: "GET",
    uri,
    querystring: {},
    headers: host ? { host: { value: host } } : {}
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

test("www requests redirect to the apex while preserving the complete path", () => {
  const root = route(request("/", undefined, "www.guilleojeda.com"));
  const spanish = route(request("/es/", undefined, "www.guilleojeda.com"));
  const unknown = route(request("/missing-page", undefined, "www.guilleojeda.com"));
  const asset = route(request("/_astro/site.12345678.js", undefined, "www.guilleojeda.com"));

  assert.equal(root.statusCode, 301);
  assert.equal(root.headers.location.value, "https://guilleojeda.com/");
  assert.equal(spanish.headers.location.value, "https://guilleojeda.com/es/");
  assert.equal(unknown.headers.location.value, "https://guilleojeda.com/missing-page");
  assert.equal(asset.headers.location.value, "https://guilleojeda.com/_astro/site.12345678.js");
});

test("the /es redirect keeps repeated, encoded, and empty query values", () => {
  const result = route(request("/es", "flag&topic=one&topic=AI%20agents&empty="));

  assert.equal(result.statusCode, 301);
  assert.equal(result.headers.location.value, "/es/?flag&topic=one&topic=AI%20agents&empty=");
});

test("www hostname matching is case insensitive", () => {
  const result = route(request("/es/", "from=blog", "WWW.GuilleOjeda.COM"));

  assert.equal(result.statusCode, 301);
  assert.equal(result.headers.location.value, "https://guilleojeda.com/es/?from=blog");
});

test("the production helper distinguishes no query from an explicitly empty query", () => {
  assert.equal(route(request("/es")).headers.location.value, "/es/");
  assert.equal(route(request("/es", "")).headers.location.value, "/es/?");
});

test("www redirects keep repeated, encoded, and empty query values unchanged", () => {
  const result = route(request(
    "/es/",
    "flag&topic=one&topic=AI%20agents&empty=",
    "www.guilleojeda.com"
  ));

  assert.equal(result.statusCode, 301);
  assert.equal(
    result.headers.location.value,
    "https://guilleojeda.com/es/?flag&topic=one&topic=AI%20agents&empty="
  );
});

test("assets and unknown routes pass through to CloudFront and S3", () => {
  const asset = request("/_astro/site.12345678.js", undefined, "guilleojeda.com");
  const unknown = request("/missing-page", undefined, "d3574ztgkciytr.cloudfront.net");

  assert.equal(route(asset), asset.request);
  assert.equal(route(unknown), unknown.request);
  assert.equal(asset.request.uri, "/_astro/site.12345678.js");
  assert.equal(unknown.request.uri, "/missing-page");
});

test("apex and CloudFront hostnames retain the existing page routing", () => {
  const apex = route(request("/", undefined, "guilleojeda.com"));
  const cloudFront = route(request("/es/", undefined, "d3574ztgkciytr.cloudfront.net"));

  assert.equal(apex.uri, "/index.html");
  assert.equal(cloudFront.uri, "/es/index.html");
});

test("rendering embeds the same routing source into the deployable template", () => {
  const rendered = JSON.parse(renderInfra());
  const functionCode = rendered.Resources.SiteRouteFunction.Properties.FunctionCode;

  assert.equal(functionCode, `${routingSource.trimEnd()}\n`);
  assert.equal(rendered.Resources.SiteDistribution.Properties.DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy, "redirect-to-https");
  assert.equal(rendered.Resources.SiteCachePolicy.Properties.CachePolicyConfig.MinTTL, 0);
  assert.deepEqual(rendered.Resources.SiteDistribution.Properties.DistributionConfig.Aliases, [
    "guilleojeda.com",
    "www.guilleojeda.com"
  ]);
  assert.deepEqual(rendered.Resources.SiteDistribution.Properties.DistributionConfig.ViewerCertificate, {
    AcmCertificateArn: { Ref: "SiteCertificate" },
    MinimumProtocolVersion: "TLSv1.2_2021",
    SslSupportMethod: "sni-only"
  });
  assert.deepEqual(rendered.Resources.SiteCertificate.Properties.DomainValidationOptions, [
    { DomainName: "guilleojeda.com", HostedZoneId: { Ref: "SiteHostedZone" } },
    { DomainName: "www.guilleojeda.com", HostedZoneId: { Ref: "SiteHostedZone" } }
  ]);
  for (const logicalId of ["SiteApexRecord", "SiteWwwRecord", "SiteApexIpv6Record", "SiteWwwIpv6Record"]) {
    const record = rendered.Resources[logicalId].Properties;
    assert.deepEqual(record.AliasTarget, {
      HostedZoneId: "Z2FDTNDATAQYW2",
      DNSName: { "Fn::GetAtt": ["SiteDistribution", "DomainName"] },
      EvaluateTargetHealth: false
    });
  }
  assert.equal(rendered.Resources.SiteDistribution.Properties.DistributionConfig.CustomErrorResponses[0].ResponseCode, 404);
});
