# Eval Schemas

JSON schemas for the skill evaluation system.

## eval_metadata.json

Stored at `<skill-dir>/eval/eval_metadata.json`. Defines the test cases and assertions for evaluating a skill.

```json
{
  "skill_name": "string — skill identifier",
  "version": "string — semver of the eval definition",
  "test_cases": [
    {
      "id": "string — unique test case identifier",
      "prompt": "string — the user prompt to send to the skill",
      "assertions": [
        "string — expected behavior or property of the output"
      ],
      "tags": ["string — optional categorization tags"],
      "weight": "number — optional weight for scoring (default 1.0)"
    }
  ]
}
```

## grading.json

Produced by the grader agent for each test case run. Stored at `<skill-dir>/eval/runs/<run-id>/grading/<test-case-id>.json`.

```json
{
  "test_case_id": "string",
  "run_id": "string",
  "timestamp": "string — ISO 8601",
  "assertions": [
    {
      "assertion": "string — the assertion text",
      "result": "pass | fail",
      "confidence": "high | medium | low",
      "evidence": "string — supporting evidence from output",
      "notes": "string — optional"
    }
  ],
  "overall_score": "number — 0.0 to 1.0 (fraction of passing assertions)",
  "factual_issues": ["string"],
  "eval_critique": {
    "vague_assertions": ["string"],
    "missing_coverage": ["string"],
    "suggested_assertions": ["string"]
  },
  "timing": {
    "start": "string — ISO 8601",
    "end": "string — ISO 8601",
    "duration_seconds": "number"
  }
}
```

## benchmark.json

Aggregate benchmark data across multiple runs. Stored at `<skill-dir>/eval/benchmark.json`.

```json
{
  "skill_name": "string",
  "description_version": "number — incremented each time description changes",
  "created_at": "string — ISO 8601",
  "entries": [
    {
      "description_version": "number",
      "description_hash": "string — SHA-256 of the description text",
      "timestamp": "string — ISO 8601",
      "scores": {
        "mean": "number",
        "median": "number",
        "std_dev": "number",
        "min": "number",
        "max": "number"
      },
      "per_test_case": [
        {
          "test_case_id": "string",
          "score": "number",
          "duration_seconds": "number"
        }
      ],
      "total_duration_seconds": "number",
      "num_test_cases": "number"
    }
  ]
}
```

## comparison.json

Output of the comparator agent when doing A/B testing between description versions. Stored at `<skill-dir>/eval/comparisons/<comparison-id>.json`.

```json
{
  "comparison_id": "string",
  "timestamp": "string — ISO 8601",
  "version_a": "number — description version",
  "version_b": "number — description version",
  "test_case_id": "string",
  "criteria_scores": [
    {
      "criterion": "string",
      "score_a": "number — 1-5",
      "score_b": "number — 1-5",
      "justification_a": "string",
      "justification_b": "string"
    }
  ],
  "total_score_a": "number",
  "total_score_b": "number",
  "winner": "A | B | tie",
  "key_differentiators": ["string"],
  "summary": "string"
}
```
