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

The Articles, Talks & sessions, Books, and Newsletter cards share an All · English · Español content filter. Articles show cumulative counts from Caylent and AWS Builder Center, plus independently covered **Views** from Simple AWS GA4. A native reach-period selector offers 7/30/90 days, calendar 12 months (default), year to date and a source-supported recorded total. Counts stay cumulative and subscribers stay current when the period changes. Simple AWS is English: All/English show its views and subscribers; Español keeps its article count with unavailable views and hides the newsletter card. Each measure has its own coverage, interval and successful-fetch date. Statistics require JavaScript; ordinary site content works without it.

The article-count rule is normalized title + actual content language across all sources: matching titles in the same language count once; different titles and published translations count separately. Unicode NFC, lowercase and collapsed whitespace preserve accents and punctuation. Count deduplication never removes eligible original/copy/translation pages from views. Simple AWS views cover only the configured article hostname and full article-path filter; they are repeated page views, not unique readers, and have different coverage from article counts. Newsletter reports Beehiiv's current active subscriptions, independently of activity periods.

Maintain speaking `occurrences` in `talks.json` with a stable per-record ID, `kind`, `status` and `language`. Count delivered talk/workshop/training/panel/session occurrences; repeated deliveries count separately, while host-only, commentary, podcast/conversation and scheduled/unknown appearances do not. A grouped record has separate occurrence facts for each slot. Maintain `publication: {status, language}` in `books.json`: published records count, including historical unavailable titles; in-progress/unknown records do not. Always assign talk/book language from the original content title, independently of UI descriptions. English brands inside a Spanish title remain Spanish. Both published books are English.

`public/_content-stats/inputs.json` maintains schema 2 article-source selection with the public Caylent delivery key and optional newsletter/analytics selectors. The build projects current speaking/book metadata into protected `dist/_content-stats/inputs.json`: schema 3 without newsletter, schema 4 with newsletter, schema 5 with newsletter plus analytics. It contains selectors/facts, not computed counts or private credentials. Duplicate IDs, missing required facts and malformed analytics configuration fail the build. Site CI uploads this exact artifact; CloudFront denies `/_content-stats/*`. Publishing an eligible article needs no repository change. Caylent uses confirmed English; Builder Center uses stored article locales; origin links are not count identities.

An enabled analytics selection contains `id`, decimal `propertyId`, `language`, `hostname`, `articlePathPattern` and verified IANA `timeZone`. The initial source is Simple AWS (`en`, `newsletter.simpleaws.dev`, full-match `/p/[^/]+/?`), using Google's returned timezone `America/Cordoba`. Its tracking start is unverified, so recorded total is unavailable. Optional `recordedSince` is a real date backed by tracking-history evidence; do not infer it from property creation or the first nonzero report. No known start means no recorded-total query. A window beginning before a configured start is unavailable rather than silently shortened. Closed reporting days end three calendar days before collection in the property timezone. Twelve months uses calendar arithmetic; early-January YTD is unavailable until there are reported days in the current year. Values may be revised by Google.

The Lambda alone writes `content-stats/v1/current.json`. Site CI cannot overwrite it and rejects artifacts containing that prefix. Counts, subscribers and each views period refresh independently. A failed supported measure can retain its exact prior value, coverage, interval, qualifications and fetch date while fresh siblings publish. Missing/invalid prior data stays unavailable, never zero. No fresh success, invalid root JSON/schema or storage failure means no replacement. One complete validated aggregate publishes; there is no daily history. JSON revalidates through CloudFront without a daily invalidation/rebuild. The collector reads only exact protected input/prior/output objects, its configured Beehiiv secret and its configured Google SSM parameter.

Run `npm run verify` with `SITE_URL` set before publishing a content change. See [the website behavior](docs/intent/website.md) for the content and operating decisions.

## AWS setup

Infrastructure is defined in `infra/template.json`. `infra/cloudfront-routing.js` and `infra/content-stats-collector.cjs` are the authoritative function sources; the renderer embeds them into a deployable template so there is no second copy to maintain. Collector code and resource changes use this operator path; ordinary site/configuration edits use GitHub Actions.

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

Beehiiv uses an operator-owned Secrets Manager secret in the same account and region, encrypted with the default `aws/secretsmanager` key. Store a JSON SecretString with key `apiKey` and the Beehiiv API key as its value; do not paste the key into chat, the CLI, source files or CI. Pass its full ARN as `BeehiivApiKeySecretArn` when first applying this template. CloudFormation passes that ARN to the collector and grants only `secretsmanager:GetSecretValue` on it; it does not create or manage the secret value. The collector reads the current secret on every input 4/5 invocation, so updating its value needs no deployment. Missing or malformed secrets affect only Newsletter. Inputs 1–3 never read it.

### Google Analytics access

Use one project-owned OAuth client and the owner's existing GA4 read grants. The collector requests only `https://www.googleapis.com/auth/analytics.readonly`; it never changes tracking or Analytics configuration. Inspect existing projects/clients first; otherwise create a dedicated project, enable **Google Analytics Data API**, and configure OAuth branding/audience. The published [statistics privacy page](https://guilleojeda.com/content-statistics/privacy/) explains the private tool's data handling; use it for the consent screen's privacy link and its `#use` section if Google requires a terms link. Keep the disclosure accurate when data use changes. Personal-use apps can skip verification but must still follow Google's User Data Policy. An external app must use the supported production/personal-use path rather than remain in Testing, where Analytics refresh tokens expire after seven days. Actual account policies can require additional setup.

For one-time offline authorization, create a web OAuth client with authorized redirect `https://developers.google.com/oauthplayground`. In Google's [OAuth Playground](https://developers.google.com/oauthplayground/), select **Use your own OAuth credentials**, enter that client, choose Offline/consent and request only the read scope above. The owner completes consent. Own-client mode avoids the Playground's default 24-hour refresh-token revocation. Keep client secrets and refresh/access tokens out of chat, repository files, shell history and logs; enter them directly through the operator's secure setup flow.

Create one operator-owned **standard SSM SecureString** in the same AWS account/region using the default `aws/ssm` key. Its compact JSON value is `{clientId,clientSecret,refreshToken}` and must fit the 4 KB standard limit. Supply the full ARN as `GoogleOAuthParameterArn`; the template passes only that reference as `GOOGLE_OAUTH_PARAMETER_ARN` and grants only exact-parameter `ssm:GetParameter`. It does not manage the parameter value. The collector decrypts once and refreshes once per input 5 invocation; access tokens stay in memory. Credential failure affects views while other families continue. To recover revoked/expired authorization, repeat the owner consent flow and replace the parameter value; no website rebuild is needed.

Before enabling `analytics`, verify a narrow aggregate API read for the selected property, exact authored host/path scope, content language, returned timezone and requested history. Simple AWS is the first source; the absence of other properties is partial coverage, not zero. No per-page report export is needed. Only explicit valid integer aggregates are measurements. Sampling/threshold/other-row metadata qualifies a displayed value; date-truncated, missing or malformed reports cannot replace a complete requested-period record.

Deploy compatible collector/IAM first. Publish and verify the compatible client through normal CI while inputs remain 4, then publish the verified analytics selector through CI to enable 5. Before restoring an older client/runtime, remove analytics through CI, invoke the compatible collector and verify a four-family snapshot. This ordering is necessary because older clients reject unknown public families. Do not manually upload site inputs or aggregate results.

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

When enabling Newsletter, deploy the backward-compatible collector/IAM through CloudFormation first, keeping configuration without newsletter selection so builds still produce input3. Publish and verify the compatible four-card client through normal CI. Only then add the verified publication selection and publish input4 through CI; invoke the deployed collector and check the public result. The runtime accepts legacy schema1/2 article-only inputs and schema 3 article/talk/book inputs. Public schema1 adds an optional current newsletter group; saved older snapshots retain their original coverage/date and leave Newsletter unavailable. Before rolling back to an older client/runtime, restore input3 through CI and use the newer collector to publish and verify a three-group aggregate. Keep inputs, runtime and browser schemas compatible; never manually upload replacement figures.

For recovery, inspect the named function's CloudWatch log group, correct the source configuration through normal CI or correct runtime/infrastructure through CloudFormation, then invoke again. Do not repair numbers by manually uploading JSON. Retained groups keep their own old date until that group's refresh succeeds. An incompatible input/schema version fails explicitly; coordinate version changes with the collector and browser. The public author inventories require no private analytics authorization. Beehiiv requires the configured API key and requests only the named publication’s active-subscription aggregate, never subscriber records. Missing/boolean/noninteger totals fail that group; a measured zero remains valid. Retention preserves the old newsletter’s identity and language even when a new selection fails. Builder Center uses an observed first-party interface; changed response shapes fail the article group and preserve its supported last success while other valid groups can refresh.

## Publish and recover

Pull requests verify and build. A push to `main` verifies, packages the exact build artifact, and deploys it through the main-only AWS role. Deployment uploads assets before HTML, retains old hashed assets, invalidates CloudFront, and checks the live English and Spanish pages. A superseded push does not overwrite a newer commit. Missing variables and failed checks fail explicitly.

Infrastructure updates use the versioned CloudFormation template under the operator session. Normal site updates use CI; do not manually upload `dist/` to bypass the workflow.

If a deployment fails, inspect the failing Actions step and its error before retrying. After repairing an upload or invalidation failure, rerun the workflow for the current intended commit. The operations are repeatable, but multi-object uploads are not atomic, so a failed run may leave mixed files until the successful retry.

To roll back a published content/code change, revert its commit on `main` and let the same workflow publish the revert. Old hashed assets are retained for cached pages and rollback. Do not delete them merely because they are absent from the latest build.

## Domain operations and recovery

The existing `guilleojeda-website` stack in `us-east-1` owns the Route 53 zone, DNS records, ACM certificate, and CloudFront configuration. Apply infrastructure updates with the render/validate/deploy commands above, preserving the stack's OIDC parameters. The production zone is `Z08987431TLTN2P7IRTQJ`; registration remains at GoDaddy. Edit DNS records in `infra/template.json` and apply the stack so the repository stays authoritative. The content-deployment role cannot change DNS.

The certificate covers `guilleojeda.com` and `www.guilleojeda.com`. ACM creates its validation CNAMEs in the zone; keep those records for automatic renewal. Wait for a completed stack update and CloudFront deployment before treating a certificate or routing change as live.

If recreating the zone, first inventory the currently authoritative DNS and check DNSSEC/parent DS state. The current template can wait for certificate validation until the new zone is delegated. While it is pending, retrieve the zone ID with `aws cloudformation describe-stack-resource --stack-name guilleojeda-website --logical-resource-id SiteHostedZone --region us-east-1`, then inspect its nameservers and records with `aws route53 get-hosted-zone` and `aws route53 list-resource-record-sets`. Compare every unrelated record before changing only the nameserver delegation at GoDaddy. Public certificate validation and dependent website aliases can then complete. Do not create a second live zone or change registration during an ordinary update.

For a web-only infrastructure rollback, apply the reviewed previous CloudFormation configuration. Content rollbacks use the Git revert workflow above. A DNS-provider rollback requires the previous provider's complete zone to still exist and serve correct records; verify it before restoring its delegation. The prelaunch nameservers were `ns03.domaincontrol.com` and `ns04.domaincontrol.com`. Keep the Route 53 zone, bucket, and old hashed assets during recovery.

Blog, mail, verification, and other unrelated records remain under the same names. Normal content deployments use `SITE_URL=https://guilleojeda.com` and do not change DNS or infrastructure.
