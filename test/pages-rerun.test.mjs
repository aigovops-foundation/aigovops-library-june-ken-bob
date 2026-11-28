import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// aigovops#53: a re-run of a failed `pages` run must deploy. Artifacts persist across attempts,
// so the upload and every deploy must share one per-attempt name, and a deploy that finds no
// artifact (the listing lags the upload) is retried once.
const workflow = readFileSync(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
const PER_ATTEMPT = '"github-pages-${{ github.run_attempt }}"';

const steps = workflow.split(/\n(?=      - )/).filter((s) => s.startsWith("      - "));
const uses = (action) => steps.filter((s) => s.includes(`uses: actions/${action}@`));

test("the upload names its artifact per attempt", () => {
  const upload = uses("upload-pages-artifact");
  assert.equal(upload.length, 1);
  assert.ok(upload[0].includes(`name: ${PER_ATTEMPT}`), upload[0]);
});

test("every deploy reads that same per-attempt artifact", () => {
  const deploys = uses("deploy-pages");
  assert.equal(deploys.length, 2, "one deploy and one retry");
  for (const d of deploys) assert.ok(d.includes(`artifact_name: ${PER_ATTEMPT}`), d);
});

test("no Pages step falls back to the default github-pages artifact name", () => {
  for (const s of [...uses("upload-pages-artifact"), ...uses("deploy-pages")]) {
    assert.doesNotMatch(s, /(name|artifact_name):\s*"?github-pages"?\s*[,}\n]/, s);
  }
});

test("a failed first deploy is retried once after a wait, and only then", () => {
  const [first, retry] = uses("deploy-pages");
  assert.match(first, /id: deploy\n/);
  assert.match(first, /continue-on-error: true/);
  assert.match(retry, /id: deploy-retry\n/);
  assert.match(retry, /if: steps\.deploy\.outcome == 'failure'/);
  assert.doesNotMatch(retry, /continue-on-error/, "a second failure must fail the job");
  const wait = steps[steps.indexOf(retry) - 1];
  assert.match(wait, /if: steps\.deploy\.outcome == 'failure'/);
  assert.match(wait, /run: sleep \d+/);
});

test("the environment URL comes from whichever deploy ran", () => {
  assert.match(workflow, /url: "\$\{\{ steps\.deploy\.outputs\.page_url \|\| steps\.deploy-retry\.outputs\.page_url \}\}"/);
});
