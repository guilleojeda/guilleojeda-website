# Guille Ojeda’s website

A bilingual work showcase built with Astro. English is at `/`, Spanish at `/es/`. The generated site is hosted in private S3 behind CloudFront and published by GitHub Actions.

The production canonical origin is `https://guilleojeda.com`. The apex serves the site, while `https://www.guilleojeda.com` permanently redirects to the same apex path and preserves the raw query string. CloudFront's generated hostname remains usable for infrastructure checks and rollback.

## Local development

Use Node 24 LTS (see `.nvmrc`) and npm.

```sh
npm ci
SITE_URL=https://guilleojeda.com npm run dev
```

Open the local URL printed by Astro. `SITE_URL` controls page metadata; navigation between local pages uses relative links. For a production build, supply the actual public HTTPS origin without a path, query, or fragment.

```sh
SITE_URL=https://guilleojeda.com npm run verify
SITE_URL=https://guilleojeda.com npm run preview
```

`verify` runs type/content checks, focused tests, a production build, and checks of the generated output. `preview` serves that build locally. GitHub uses the same verification command with the deployed origin configured in repository variables.

## Update content

Edit the small files in `src/content/`:

| File | Content |
| --- | --- |
| `profile.json` | Bio, role, community activities, course, interface copy, primary links, and metadata |
| `projects.json` | Selected work and its destinations |
| `talks.json` | Talks, workshops, hosting, podcasts, training, and video appearances; highlight selection and public links |
| `books.json` | Authored books, descriptions, and per-book publication/status labels |

Keep common identifiers, dates, and URLs in each record once. Put the two translations beside each other under `en` and `es`. To add a talk or project, copy an existing record, give it a distinct ID, and update its facts, links, and both translations. Set a project’s `featured: true` to show a card; other projects appear in the compact work archive. Page components should not need edits. Publication titles can stay in their original language.

Every record in `talks.json` appears in the complete archive, grouped by its numeric `year`. Set `featured: true` for a highlight card; provide paired `event`, `format`, `title`, and `text`. A repeated talk at a different event is a separate record. Add `href` and a paired `cta` when a public recording, deck, or event page exists; otherwise omit both. A missing recording does not require omitting a supported appearance.

Use `format` and the description to distinguish speaking, hosting, and video commentary. Hosting an event does not imply presenting its guest talks, and reacting to a keynote does not imply speaking at the conference. Label announced sessions as scheduled until delivery is confirmed. White papers belong in `projects.json`, with the author or co-author role stated explicitly. If an old publication URL redirects to a different edition, use a reliable link to the original edition or its author announcement.

Community leadership and organizing records are in `profile.json` → `about.activities`. Book `meta` labels distinguish published work from a book in progress. The historical course lives under `authorship.courseTitle`, `courseMeta`, and `courseText`; its unavailable status should remain accurate.

For a role change, update the paired copy in `profile.json`: `hero.intro` (opening bio), `about.intro`, `about.facts[0].value` (Now row), and `site.title`/`site.description` (metadata). `hero.roleContext` controls the organization/team label. These are editable prose, so update both languages together.

The portrait and other public assets live in the repository. Keep alternative text accurate when replacing an image. Do not add uncertain release dates, availability claims, or live audience counts without confirming them.

### Content statistics

The Articles, Talks & sessions, Books, Newsletter, and Dónde Aprendo AWS cards share an All · English · Español content filter. Articles show cumulative counts from Caylent and AWS Builder Center, plus optional Simple AWS published posts across web and email and the current public Cloudy Things archive. Cloudy Things is included only when its source selector is enabled; the archive is exhausted across its bounded pagination, filtered to published records authored by Guillermo Ojeda with valid publication dates. The Dónde Aprendo AWS card contains page views and, when selected, recorded external-link clicks; both cover the directory across five periods, appear under All and Español, and hide with the Spanish-source card under English. Clicks are separate from Views and incoming Search and can repeat. Independently covered **Views** from Simple AWS GA4 and Google-reported **Search clicks** from Search Console remain separate measures. A native reach-period selector offers 7/30/90 days, calendar 12 months (default), and year to date, plus a source-supported Views recorded total when available; there is no Search or directory total. Counts stay cumulative and subscribers stay current when the period changes. Simple AWS is English: All/English show its views, Search clicks and subscribers; Español keeps its article count with unavailable activity measures and hides the newsletter card. Each measure has its own unit, source coverage, interval, timezone and successful-fetch date. Search clicks are reported events, not unique readers or an addition to Views, and Google filtering can make the covered result partial. Statistics require JavaScript; ordinary site content works without it.

The article-count rule is normalized title + actual content language across all sources: matching titles in the same language count once; different titles and published translations count separately. Unicode NFC, lowercase and collapsed whitespace preserve accents and punctuation. This same rule applies to Cloudy Things originals and older republications and to copies across sources; publication URLs and origin/canonical metadata do not override it. Cloudy Things counts its complete current public archive for the selected author, using the archive's own published status, publication dates and validated pagination. A changed, truncated, malformed or incomplete archive fails closed and retains the last complete Articles family with its original coverage, scope and dates; there is no RSS, sitemap or partial-inventory fallback. Simple AWS counts its current active published Beehiiv catalog across web-only, email-only, and combined posts; drafts, future scheduled posts, and archived posts are excluded. These inventories are not complete histories of deleted or archived posts, proof of email delivery, or complete records of writing. Count deduplication never removes eligible original/copy/translation pages from views. Simple AWS views cover only the configured article hostname and full article-path filter; they are repeated page views, not unique readers, and have different coverage from article counts. Search Console clicks use the exact Domain property and canonical newsletter article URL filter maintained in the protected selector; they use America/Los_Angeles calendar dates, close three days before collection, and keep a full requested period only when it starts on or after the verified `availableSince` boundary. An unsupported period is unavailable rather than shortened. Newsletter reports Beehiiv's current active subscriptions, independently of activity periods.

Maintain speaking `occurrences` in `talks.json` with a stable per-record ID, `kind`, `status` and `language`. Count delivered talk/workshop/training/panel/session occurrences; repeated deliveries count separately, while host-only, commentary, podcast/conversation and scheduled/unknown appearances do not. A grouped record has separate occurrence facts for each slot. Maintain `publication: {status, language}` in `books.json`: published records count, including historical unavailable titles; in-progress/unknown records do not. Always assign talk/book language from the original content title, independently of UI descriptions. English brands inside a Spanish title remain Spanish. Both published books are English.

`public/_content-stats/inputs.json` maintains schema 2 article sources: Caylent and Builder Center are required; the optional exact `{ "id": "simple-aws" }` source enables its article inventory; and the optional Cloudy Things selector is exactly `{ "id": "cloudy-things", "authorName": "Guillermo Ojeda", "language": "en" }`. Simple AWS requires and reuses the existing valid English newsletter selector, while Cloudy Things needs no newsletter or new credential. Newsletter, analytics, Search Console and directory Analytics selectors remain independent metric configuration. The build projects current speaking/book metadata into protected `dist/_content-stats/inputs.json`: without `directoryAnalytics`, schema 3 is used without newsletter, schema 4 with newsletter, schema 5 with newsletter plus analytics, and schema 6 only when the exact Search Console selector is added alongside both existing input5 selections. With the directory selector and no outbound-click flag, it generates input7; with literal `outboundClicks: true`, it generates input8. Both forms preserve the existing input3–7 dependencies, and neither requires Newsletter for directory-only metrics. Adding article sources does not change the existing versions or public schema. The production Search selection uses the verified Simple AWS English article scope with `availableSince: 2025-06-19`; this is an available-history boundary, not a lifetime or continuous-tracking claim. Inputs contain selectors/facts, not computed counts or private credentials. Duplicate IDs, missing required facts and every malformed, unknown or credential-bearing selector field fail the build. Site CI uploads this exact artifact; CloudFront denies `/_content-stats/*`. Publishing an eligible article needs no repository change. Caylent uses confirmed English; Builder Center uses stored article locales; Simple AWS uses owner-confirmed English; Cloudy Things uses the owner-confirmed English policy and original-title language fallback. Origin links are not count identities. Publish compatible collector and client code while optional selectors are absent, then enable them through separate normal CI selector publications. Rollback removes only the relevant selector through CI, invokes the compatible collector to publish actual remaining coverage, and verifies that snapshot before restoring any older client/runtime. No new credentials, public schema or infrastructure is needed.

An enabled analytics selection contains `id`, decimal `propertyId`, `language`, `hostname`, `articlePathPattern` and verified IANA `timeZone`. The initial source is Simple AWS (`en`, `newsletter.simpleaws.dev`, full-match `/p/[^/]+/?`), using Google's returned timezone `America/Cordoba`. Its tracking start is unverified, so recorded total is unavailable. Optional `recordedSince` is a real date backed by tracking-history evidence; do not infer it from property creation or the first nonzero report. No known start means no recorded-total query. A window beginning before a configured start is unavailable rather than silently shortened. Closed reporting days end three calendar days before collection in the property timezone. Twelve months uses calendar arithmetic; early-January YTD is unavailable until there are reported days in the current year. Values may be revised by Google.

The Lambda alone writes `content-stats/v1/current.json`. Site CI cannot overwrite it and rejects artifacts containing that prefix. Counts, subscribers, each views period, each Search period and each directory-views period refresh independently. A failed supported measure can retain its exact prior value, source, scope, interval, timezone and successful-fetch date while fresh siblings publish; a shared Google OAuth failure affects all enabled Google families, while a failure in one provider report does not suppress the other enabled families. Missing/invalid prior data stays unavailable, never zero. No fresh success, invalid root JSON/schema or storage failure means no replacement. One complete validated aggregate publishes; there is no daily history. JSON revalidates through CloudFront without a daily invalidation/rebuild. The collector reads only exact protected input/prior/output objects, its configured Beehiiv secret when Newsletter is selected, and its configured Google SSM parameter when a Google family is enabled.

The optional Dónde Aprendo AWS Analytics selector reuses the exact five source and scope fields `{ "id": "donde-aprendo-aws", "propertyId": "424203315", "hostname": "dondeaprendoaws.com", "language": "es", "timeZone": "America/Buenos_Aires" }`. With the optional `outboundClicks: true` field absent, adding the selector to a base input3 configuration or any existing input4–6 configuration generates protected input7 and selects directory page views only. With literal `outboundClicks: true`, a base input3 or any supported input4–7 configuration generates input8 and selects the additional outbound-click family. The flag has no Newsletter dependency and does not change the existing page-views scope. The build deep-copies the selected fields and adds no credential or computed traffic; false, null, strings, unknown fields and private fields are rejected. The maintained selector currently omits `outboundClicks`, so it still generates input7.

Public `directoryViews` is a period-only family for the Dónde Aprendo AWS directory: 7 days, 30 days, 90 days, 12 months and year to date, with its own interval, timezone, qualifications and fetch date. Page views can repeat and remain separate from article views/readership; there is no directory recorded total. When input8 is selected, public `directoryOutboundClicks` adds its own records for the same five periods and metadata. It counts GA4-reported `click` events with `outbound=true` on the exact directory host across all paths; recorded events include links to the publication and social channels, including footer links, and repeated clicks can count. This is a count of reported events, not unique people or incoming Search clicks. The public records contain only aggregate counts and provenance, never provider IDs, hostnames, event rows, destinations, or credentials. Empty reports remain unavailable; only an explicit safe-integer zero is measured zero. Click and Views periods retain and fail independently, and enabling clicks does not change the Views scope. No directory recorded total, new public root schema, infrastructure or OAuth scope is introduced.

Publish compatible collector and client code while `outboundClicks` is absent, then enable only `outboundClicks: true` through a separate normal main-branch CI publication. To roll back click collection, remove only that flag through CI and publish and verify the input7 page-views snapshot. Removing the full directory selector removes both directory families. Never manually publish the protected input or aggregate.

Run `npm run verify` with `SITE_URL` set before publishing a content change. See [the website behavior](docs/intent/website.md) for the content and operating decisions.

## AWS setup

Infrastructure is defined in `infra/template.json`. `infra/cloudfront-routing.js` and `infra/content-stats-collector.cjs` are the authoritative function sources; the renderer embeds them into a deployable template so there is no second copy to maintain. Initial setup and infrastructure changes use an operator CloudFormation session. After the one-time CI-policy bootstrap below, collector code-only updates run in the existing main-branch site job; all other infrastructure changes remain operator-managed.

Use a temporary AWS operator session for the intended account and `us-east-1`. Inspect the existing GitHub OIDC provider before setup:

```sh
aws sts get-caller-identity
aws iam list-open-id-connect-providers
```

If the account already has the provider for `https://token.actions.githubusercontent.com`, pass its ARN as `GitHubOidcProviderArn`. Do not create another provider or replace one owned by another application. If none exists, the stack can create it with `CreateOidcProviderIfMissing=true`.

The rendered template exceeds CloudFormation's 51,200-byte direct-body limit. For updates to the existing stack, use its private site bucket for the template and keep the embedded function sources:

```sh
guille_stack_template="$(mktemp)"
node scripts/render-infra.mjs --output "$guille_stack_template"
guille_template_bucket="$(aws cloudformation describe-stacks \
  --stack-name guilleojeda-website --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue | [0]' \
  --output text)"
aws cloudformation deploy \
  --stack-name guilleojeda-website \
  --template-file "$guille_stack_template" \
  --s3-bucket "$guille_template_bucket" \
  --s3-prefix _content-stats/templates \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides BeehiivApiKeySecretArn=YOUR_FULL_SECRET_ARN \
    GoogleOAuthParameterArn=YOUR_FULL_PARAMETER_ARN \
  --no-execute-changeset
rm "$guille_stack_template"
```

The CLI uploads the template and CloudFormation validates it while creating the change set. Inspect the returned change-set ARN with `aws cloudformation describe-change-set`, confirm only the intended resources change, then use `aws cloudformation execute-change-set` and `aws cloudformation wait stack-update-complete`, all in `us-east-1`. Preserve existing OIDC parameters on updates. This path publishes infrastructure, not site content or collector inputs.

Beehiiv uses an operator-owned Secrets Manager secret in the same account and region, encrypted with the default `aws/secretsmanager` key. Store a JSON SecretString with key `apiKey` and the Beehiiv API key as its value; do not paste the key into chat, the CLI, source files or CI. Pass its full ARN as `BeehiivApiKeySecretArn` when first applying this template. CloudFormation passes that ARN to the collector and grants only `secretsmanager:GetSecretValue` on it; it does not create or manage the secret value. The collector reads the current secret on every input 4–8 invocation when Newsletter is selected; directory-only inputs 7/8 do not read Beehiiv. Missing or malformed secrets affect Newsletter and, when Simple AWS article counts are enabled, Articles; other families continue. Inputs 1–3 never read it, and directory-only inputs 7/8 have no Beehiiv dependency.

### Google Analytics and Search Console access

Use one project-owned OAuth client and the owner's existing Google read grants. Input5 uses `https://www.googleapis.com/auth/analytics.readonly`; enabling Search Console requires fresh consent for exactly these two read-only scopes: `https://www.googleapis.com/auth/analytics.readonly` and `https://www.googleapis.com/auth/webmasters.readonly`. The collector never changes tracking or Search Console configuration. Inspect existing projects/clients first; otherwise create a dedicated project, enable **Google Analytics Data API** and **Search Console API**, and configure OAuth branding/audience. The published [statistics privacy page](https://guilleojeda.com/content-statistics/privacy/) explains the private tool's data handling; use it for the consent screen's privacy link and its `#use` section if Google requires a terms link. Keep the disclosure accurate when data use changes. Personal-use apps can skip verification but must still follow Google's User Data Policy. An external app must use the supported production/personal-use path rather than remain in Testing, where Analytics refresh tokens expire after seven days. Actual account policies can require additional setup.

For one-time offline authorization, create a web OAuth client with authorized redirect `https://developers.google.com/oauthplayground`. In Google's [OAuth Playground](https://developers.google.com/oauthplayground/), select **Use your own OAuth credentials**, enter that client, choose Offline/consent and request only the approved read-only scope or, for Search Console enablement, exactly the two approved read-only scopes above. The owner completes consent. Own-client mode avoids the Playground's default 24-hour refresh-token revocation. Keep client secrets and refresh/access tokens out of chat, repository files, shell history and logs; enter them directly through the operator's secure setup flow.

Create one operator-owned **standard SSM SecureString** in the same AWS account/region using the default `aws/ssm` key. Its compact JSON value is `{clientId,clientSecret,refreshToken}` and must fit the 4 KB standard limit. Supply the full ARN as `GoogleOAuthParameterArn`; the template passes only that reference as `GOOGLE_OAUTH_PARAMETER_ARN` and grants only exact-parameter `ssm:GetParameter`. It does not manage the parameter value. When Google metrics are enabled together, the collector decrypts this same parameter once and refreshes one invocation-local token once; the token is shared by all enabled Google families and never published or logged. A shared credential failure affects all enabled Google families while count/newsletter families continue. To recover revoked/expired authorization, repeat the owner consent flow with the exact two read-only scopes and replace this same parameter value; no website rebuild is needed.

Before enabling `analytics`, verify a narrow aggregate API read for the selected property, exact authored host/path scope, content language, returned timezone and requested history. Before adding `searchConsole`, verify the exact Domain property, canonical article URL regex, English scope, Web search type, final aggregate response, useful history and the Pacific date boundary. Configure `availableSince` only from that source proof. Search windows are full requested calendar periods; a start before `availableSince` is omitted rather than clipped, and no lifetime or Search total is inferred. Simple AWS is the first source; the absence of other properties is partial coverage, not zero. No per-page report export is needed. Only explicit valid integer aggregates are measurements. Sampling/threshold/other-row metadata qualifies a displayed value; date-truncated, missing or malformed reports cannot replace a complete requested-period record.

Deploy compatible collector/IAM first. Publish and verify the compatible client through normal CI while inputs remain 4, then publish the verified analytics selector through CI to enable 5. After actual Search Console property, authorization and source-history proof, publish the compatible runtime and client that tolerate input6 and its public family, then add the Search Console selector through normal CI to move from input5 to input6. For Dónde Aprendo AWS, publish compatible runtime/client support while the directory selector is absent, then add the five-field selector through CI to generate input7. Enable clicks later by publishing only `outboundClicks: true` through CI to generate input8; directory-only inputs 7/8 remain independent of Newsletter. To roll back click collection, remove only that flag through CI, publish input7 and verify the page-views-only snapshot. Before restoring an older client/runtime, remove other active selectors through CI, invoke the compatible collector to publish the corresponding reduced input and family set, and verify that public snapshot before rollback. This ordering is necessary because older clients reject unknown public families. Do not manually upload site inputs or aggregate results.

For initial setup, the template upload needs an already available private bucket; the site bucket does not exist until the stack creates it. Select either `GitHubOidcProviderArn=YOUR_EXISTING_PROVIDER_ARN` or `CreateOidcProviderIfMissing=true` as appropriate. Do not create a second OIDC provider or reuse another application's resources without confirming ownership.

Read the outputs after the stack finishes:

```sh
aws cloudformation describe-stacks \
  --stack-name guilleojeda-website \
  --region us-east-1 \
  --query 'Stacks[0].Outputs' \
  --output table
```

Configure these GitHub Actions **repository variables**:

| Variable | Value |
| --- | --- |
| `AWS_REGION` | `us-east-1` |
| `AWS_ROLE_ARN` | `DeploymentRoleArn` output |
| `S3_BUCKET` | `BucketName` output |
| `CLOUDFRONT_DISTRIBUTION_ID` | `DistributionId` output |
| `SITE_URL` | `https://guilleojeda.com` |

These values are identifiers, not credentials. For example, `gh variable set AWS_REGION --body us-east-1`. GitHub assumes the deployment role through OIDC; do not add AWS access-key secrets to the repository.

### Bootstrap collector code deployment in CI

The first adoption of collector deployment in CI needs one operator CloudFormation update. It adds only the site role's access to the existing stack and named change sets, exact collector Lambda handler permissions, `iam:GetRole` on the existing collector execution-role and scheduler-role ARNs plus the `arn:${AWS::Partition}:iam::${AWS::AccountId}:role/${AWS::StackName}-SiteDeploymentRole-*` prefix needed to resolve the `DeploymentRoleArn` stack output without a self-`GetAtt` reference, pass-role access to the collector execution role for Lambda only, `route53:GetHostedZone`, `route53:ListTagsForResource`, and `route53:ListQueryLoggingConfigs` on the exact existing `SiteHostedZone` to resolve `HostedZoneNameServers`; `cloudfront:GetDistribution`, `cloudfront:GetDistributionConfig`, and `cloudfront:ListTagsForResource` on the exact existing `SiteDistribution` to resolve `DistributionDomainName` (read-only handler permissions; existing invalidations remain distribution-scoped), and read access to `_content-stats/templates/*`. Keep the current deployed `ContentStatsCollector.Properties.Code.ZipFile` during this bootstrap so the first CI run exercises a real collector code update. The normal workflow keeps the same `production-site` concurrency group and updates the collector before it publishes the matching site build and protected inputs.

In the authorized operator session, render the current template but restore the deployed collector source into this one-time bootstrap copy:

```sh
set -euo pipefail
guille_original_template="$(mktemp)"
guille_rendered_template="$(mktemp)"
guille_bootstrap_template="$(mktemp)"
aws cloudformation get-template \
  --stack-name guilleojeda-website --template-stage Original --region us-east-1 \
  --query TemplateBody --output json > "$guille_original_template"
node scripts/render-infra.mjs --output "$guille_rendered_template"
jq --slurpfile original "$guille_original_template" \
  '.Resources.ContentStatsCollector.Properties.Code.ZipFile = $original[0].Resources.ContentStatsCollector.Properties.Code.ZipFile' \
  "$guille_rendered_template" > "$guille_bootstrap_template"
guille_template_bucket="$(aws cloudformation describe-stacks \
  --stack-name guilleojeda-website --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue | [0]' --output text)"
guille_template_key="_content-stats/templates/ci-bootstrap-$(date -u +%s).json"
guille_parameters="$(aws cloudformation describe-stacks \
  --stack-name guilleojeda-website --region us-east-1 \
  --query 'Stacks[0].Parameters[].ParameterKey' --output json | \
  jq 'map({ParameterKey: ., UsePreviousValue: true})')"
aws s3 cp "$guille_bootstrap_template" "s3://$guille_template_bucket/$guille_template_key" \
  --region us-east-1 --content-type application/json --cache-control private,no-store
guille_change_set="collector-ci-bootstrap-$(date -u +%s)"
aws cloudformation create-change-set \
  --stack-name guilleojeda-website --change-set-name "$guille_change_set" \
  --change-set-type UPDATE \
  --template-url "https://s3.us-east-1.amazonaws.com/$guille_template_bucket/$guille_template_key" \
  --parameters "$guille_parameters" --capabilities CAPABILITY_IAM --region us-east-1
aws cloudformation wait change-set-create-complete \
  --stack-name guilleojeda-website --change-set-name "$guille_change_set" --region us-east-1
aws cloudformation describe-change-set \
  --stack-name guilleojeda-website --change-set-name "$guille_change_set" --region us-east-1 \
  --query 'Changes[].ResourceChange.[LogicalResourceId,ResourceType,Action,Replacement]' --output table
```

Inspect the change set and proceed only when it updates the existing `SiteDeploymentRole` policy with no collector-code or other resource change. Then execute it and wait for the stack update:

```sh
aws cloudformation execute-change-set \
  --stack-name guilleojeda-website --change-set-name "$guille_change_set" --region us-east-1
aws cloudformation wait stack-update-complete \
  --stack-name guilleojeda-website --region us-east-1
rm "$guille_original_template" "$guille_rendered_template" "$guille_bootstrap_template"
```

The CI role can upload templates through its existing site-object permission and can read only that template prefix for CloudFormation. It cannot write `content-stats/v1/current.json`, invoke the collector, read protected inputs or the prior aggregate, or read Beehiiv/Google credentials. CloudFormation change-set creation is restricted to the collector change-set name prefix and protected template URL; change-set inspection and execution are scoped to the existing stack. Lambda actions are scoped to the collector. `iam:GetRole` is limited to the existing collector execution-role and scheduler-role ARNs and the same-stack `SiteDeploymentRole-*` prefix needed to read its `DeploymentRoleArn` output without a self-reference; the `HostedZoneNameServers` read handler uses only `route53:GetHostedZone`, `route53:ListTagsForResource`, and `route53:ListQueryLoggingConfigs` on `SiteHostedZone`, while the `DistributionDomainName` read handler uses only `cloudfront:GetDistribution`, `cloudfront:GetDistributionConfig`, and `cloudfront:ListTagsForResource` on `SiteDistribution`; these additions grant no DNS or distribution configuration/tag writes; `iam:PassRole` names only the collector execution role with Lambda as the service. CloudFormation's handler permissions include exact-function configuration, tag and metadata operations; the code-only restriction is enforced by the deployment script, not by IAM's nested property evaluation. The script rejects a nonempty CloudFormation service-role ARN so the existing CI caller permissions remain effective. It checks that its checkout and `GITHUB_SHA` are current `main`, compares the deployed original template to the renderer, and fails before mutation if anything besides the collector's inline code differs. CloudFormation may also preview `ContentStatsSchedulerRole`, `ContentStatsDailySchedule` and `SiteDeploymentRole`. The script accepts at most one `ContentStatsSchedulerRole` preview only when every detail is a dynamic `Properties.Policies` reference caused by `ContentStatsCollector.Arn`; one `ContentStatsDailySchedule` preview only when every detail is a dynamic `Properties.Target` reference caused by either `ContentStatsCollector.Arn` or `ContentStatsSchedulerRole.Arn`; and one `SiteDeploymentRole` preview only when every detail is a dynamic `Properties.Policies` reference caused by `ContentStatsSchedulerRole.Arn`. Direct, static, replacement, duplicate or unknown changes fail before execution. The script creates and inspects one UPDATE change set, preserves every stack parameter with `UsePreviousValue`, waits for the stack, then keeps the Lambda's signed code URL in memory and fetches its code without logging the URL or source. A temporary archive is read with the system `unzip` command to compare the deployed `index.js` bytes and SHA-256 with the rendered source. No-op updates are idempotent and still verify deployed source; failed or uncertain CloudFormation responses fail the job.

### Collector operation

EventBridge Scheduler invokes the collector daily at **09:15 America/Argentina/Cordoba**, with no flexible window. The Node 24 Lambda has a five-minute timeout and 30-day log retention. Provider requests have a ten-second deadline and one transient retry; Caylent pagination is capped at 100 pages of 10 records, and Builder Center at 20 cursor pages of 50 records. Short or empty Builder pages with a cursor still continue. Builder article bodies are not fetched for counts. Reaching the cap fails the refresh rather than publishing an incomplete count. Scheduler delivery and Lambda asynchronous execution each allow one retry within one hour.

The collector uses shared regional Lambda concurrency. Each invocation recomputes current groups, retains supported failed groups when fresh siblings publish, and replaces the complete aggregate object. If invocations overlap, the one that finishes last can publish an older complete snapshot.

The stack exposes `ContentStatsFunctionName`, `ContentStatsScheduleName` and `ContentStatsScheduleGroupName`. Inspect the current stack outputs and schedule before operating it. After infrastructure and normal site/configuration publication, invoke the actual deployed function for initial output or to verify a repair:

```sh
guille_stats_function="$(aws cloudformation describe-stacks \
  --stack-name guilleojeda-website --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`ContentStatsFunctionName`].OutputValue | [0]' \
  --output text)"
aws lambda invoke --function-name "$guille_stats_function" \
  --region us-east-1 /tmp/guille-content-stats-result.json
cat /tmp/guille-content-stats-result.json
```

Check both the invocation metadata for `FunctionError` and the response body, then inspect the public JSON and both language pages. A manual invocation recomputes from current inputs/source data; it never increments the old total or uses a scheduled event's old timestamp. Logs identify successful counts/pages/dates or sanitized failure codes without recording provider bodies or delivery keys.

When enabling Newsletter, deploy the backward-compatible collector/IAM through CloudFormation first, keeping configuration without newsletter selection so builds still produce input3. Publish and verify the compatible five-card client through normal CI. Only then add the verified publication selection and publish input4 through CI; invoke the deployed collector and check the public result. The runtime accepts legacy schema1/2 article-only inputs and schema 3 article/talk/book inputs. Public schema1 adds optional Newsletter and directory Views/outbound-click families; saved older snapshots retain their original coverage/date and leave any absent family unavailable. For Dónde Aprendo AWS, add the exact five-field selector to a base input3 configuration or an existing input4–6 configuration to generate input7; directory-only input7 has no Newsletter dependency. Adding `outboundClicks: true` produces input8 with an independent click family. Before rolling back to an older client/runtime, remove the newest flag/selector through CI and use the newer collector to publish and verify the corresponding reduced aggregate. Keep inputs, runtime and browser schemas compatible; never manually upload replacement figures.

For recovery, inspect the named function's CloudWatch log group, correct the source configuration through normal CI or correct runtime/infrastructure through CloudFormation, then invoke again. Do not repair numbers by manually uploading JSON. Retained groups keep their own old date until that group's refresh succeeds; Search and directory retention preserve each exact prior source, scope, interval and collection date. An incompatible input/schema version fails explicitly; coordinate version changes with the collector and browser. The public author inventories require no private analytics authorization. Beehiiv requires the configured API key and requests only the named publication’s active-subscription aggregate, never subscriber records. Missing/boolean/noninteger totals fail that group; a measured zero remains valid. Retention preserves the old newsletter’s identity and language even when a new selection fails. Builder Center uses an observed first-party interface; changed response shapes fail the article group and preserve its supported last success while other valid groups can refresh. Search or directory report failures leave valid enabled Google, count and subscriber groups available; a shared OAuth failure retains all enabled Google families until authorization is repaired.

## Publish and recover

Pull requests verify and build. A push to `main` verifies, packages the exact build artifact, and deploys it through the main-only AWS role. Deployment uploads assets before HTML, retains old hashed assets, invalidates CloudFront, and checks the live English and Spanish pages. A superseded push does not overwrite a newer commit. Missing variables and failed checks fail explicitly.

Infrastructure updates use the versioned CloudFormation template under the operator session. Collector code-only updates use the guarded CloudFormation change set in the main-branch CI job. Normal site updates use CI; do not manually upload `dist/` to bypass the workflow.

If a deployment fails, inspect the failing Actions step and its error before retrying. After repairing an upload or invalidation failure, rerun the workflow for the current intended commit. The operations are repeatable, but multi-object uploads are not atomic, so a failed run may leave mixed files until the successful retry.

To roll back a published content/code change, revert its commit on `main` and let the same workflow publish the revert. Old hashed assets are retained for cached pages and rollback. Do not delete them merely because they are absent from the latest build.

## Domain operations and recovery

The existing `guilleojeda-website` stack in `us-east-1` owns the Route 53 zone, DNS records, ACM certificate, and CloudFront configuration. Apply infrastructure updates with the render/validate/deploy commands above, preserving the stack's OIDC parameters. The production zone is `Z08987431TLTN2P7IRTQJ`; registration remains at GoDaddy. Edit DNS records in `infra/template.json` and apply the stack so the repository stays authoritative. The content-deployment role cannot change DNS.

The certificate covers `guilleojeda.com` and `www.guilleojeda.com`. ACM creates its validation CNAMEs in the zone; keep those records for automatic renewal. Wait for a completed stack update and CloudFront deployment before treating a certificate or routing change as live.

If recreating the zone, first inventory the currently authoritative DNS and check DNSSEC/parent DS state. The current template can wait for certificate validation until the new zone is delegated. While it is pending, retrieve the zone ID with `aws cloudformation describe-stack-resource --stack-name guilleojeda-website --logical-resource-id SiteHostedZone --region us-east-1`, then inspect its nameservers and records with `aws route53 get-hosted-zone` and `aws route53 list-resource-record-sets`. Compare every unrelated record before changing only the nameserver delegation at GoDaddy. Public certificate validation and dependent website aliases can then complete. Do not create a second live zone or change registration during an ordinary update.

For a web-only infrastructure rollback, apply the reviewed previous CloudFormation configuration. Content rollbacks use the Git revert workflow above. A DNS-provider rollback requires the previous provider's complete zone to still exist and serve correct records; verify it before restoring its delegation. The prelaunch nameservers were `ns03.domaincontrol.com` and `ns04.domaincontrol.com`. Keep the Route 53 zone, bucket, and old hashed assets during recovery.

Blog, mail, verification, and other unrelated records remain under the same names. Normal content deployments use `SITE_URL=https://guilleojeda.com` and do not change DNS or infrastructure.
