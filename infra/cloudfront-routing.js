/*
 * CloudFront viewer-request function for the Phase 1 distribution.
 *
 * This is the authoritative routing source. The CloudFormation template is
 * rendered with this file's contents so the deployed function and the local
 * routing tests use the same implementation.
 */

function queryStringForRedirect(request) {
  var rawQueryString = request.rawQueryString();
  if (rawQueryString === undefined) {
    return "";
  }
  // CloudFront's runtime 2.0 helper returns the unparsed query string. Keep
  // it verbatim so flags, duplicate keys, ordering, encoding, and an empty
  // query marker all survive the permanent redirect.
  return "?" + rawQueryString;
}

function permanentRedirect(path, request) {
  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      location: {
        value: path + queryStringForRedirect(request)
      }
    }
  };
}

function handler(event) {
  var request = event.request;

  if (request.uri === "/") {
    request.uri = "/index.html";
    return request;
  }

  if (request.uri === "/es/") {
    request.uri = "/es/index.html";
    return request;
  }

  if (request.uri === "/es") {
    return permanentRedirect("/es/", request);
  }

  // Assets and unknown paths pass through so S3/CloudFront can return their
  // real object or the configured 404 response.
  return request;
}
