# Agent evals: Moonstage vs freestyle

Does Moonstage make a coding agent better at making games than letting it write everything from scratch?
This directory holds a small, repeatable comparison.

- `briefs.json`: game briefs, each with a follow-up change request, the two conditions and the protocol.
- `score.mjs`: objective checks on the outputs (validation, tests, headless run, shareable single file,
  follow-up edit size).
- `results/`: reports from past runs.

## Running

For each brief and condition, give a fresh agent with no prior knowledge of Moonstage the brief, the
condition text and the protocol, with `{cli}` and `{dir}` filled in. Use the same model for every run, so the
only difference is the tool. Then:

```bash
node evals/score.mjs <runs-directory>
```

Also open every game in a browser and play it: does it load without errors, and does it do what the brief
asks? Record that next to the score table in `results/<date>.md`.

## Campaigns

One-shot briefs reward speed. A campaign (`campaigns` in `briefs.json`) is one game plus five follow-ups
applied in order, where every follow-up must keep earlier features working: the setting where tests and
structure should pay off. Give the agent the brief, all follow-ups, the condition and `campaignProtocol`.
The agent copies the project after each step (`{dir}-step0` … `{dir}-step5`); `score.mjs` reports each
step's edit size. Also play the final game through every earlier feature and record what regressed.

## What counts

1. **Works**: loads without errors and meets the brief.
2. **Follow-up cost**: how much had to change for the follow-up request (smaller is better, if it works).
3. **Verifiable**: can the result be checked without a human (tests, headless runs)?
4. **Shareable**: one file anyone can open.
5. **Agent effort**: tool calls and time, from the agent harness.
