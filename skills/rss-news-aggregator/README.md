# RSS News Aggregator - Quick Start

## Installation

```bash
# Install Python dependencies
pip3 install feedparser python-dateutil
```

## Usage Examples

### Example 1: Get latest AI news from all sources

```bash
cd skills/rss-news-aggregator

# Fetch from all 92 sources (last 3 days)
python3 scripts/fetch_rss.py --days 3 --output /tmp/raw.json

# Filter for AI-related content
python3 scripts/filter_content.py \
  --input /tmp/raw.json \
  --query "AI" \
  --output /tmp/filtered.json

# Generate reports
python3 scripts/generate_report.py \
  --input /tmp/filtered.json \
  --output-dir ../../docs/news

# View the HTML report
open ../../docs/news/rss-news-$(date +%Y-%m-%d).html
```

### Example 2: Monitor specific blogs

```bash
# Only fetch from Simon Willison, Gary Marcus, and Paul Graham
python3 scripts/fetch_rss.py \
  --days 7 \
  --sources "simonwillison.net,garymarcus.substack.com,paulgraham.com" \
  --output /tmp/raw.json

python3 scripts/filter_content.py \
  --input /tmp/raw.json \
  --output /tmp/filtered.json

python3 scripts/generate_report.py \
  --input /tmp/filtered.json \
  --output-dir ../../docs/news
```

### Example 3: Search for specific topics

```bash
# Search for "Claude" or "Anthropic" mentions
python3 scripts/fetch_rss.py --days 7 --output /tmp/raw.json

python3 scripts/filter_content.py \
  --input /tmp/raw.json \
  --query "Claude Anthropic" \
  --min-quality 70 \
  --output /tmp/filtered.json

python3 scripts/generate_report.py \
  --input /tmp/filtered.json \
  --output-dir ../../docs/news
```

### Example 4: High-quality security news

```bash
python3 scripts/fetch_rss.py \
  --days 7 \
  --sources "krebsonsecurity.com,troyhunt.com,lcamtuf.substack.com" \
  --output /tmp/raw.json

python3 scripts/filter_content.py \
  --input /tmp/raw.json \
  --query "security vulnerability" \
  --min-quality 80 \
  --output /tmp/filtered.json

python3 scripts/generate_report.py \
  --input /tmp/filtered.json \
  --output-dir ../../docs/news
```

## Testing

```bash
# Run the test suite
./scripts/test.sh
```

## Output Files

Reports are saved to `docs/news/`:
- `rss-news-YYYY-MM-DD.md` - Markdown format
- `rss-news-YYYY-MM-DD.html` - HTML format (Linear style)

## Available Sources

92 high-quality tech blogs from HN Popularity Contest 2025. See `assets/rss-sources.json` for the complete list.

Notable sources include:
- **AI/ML**: Simon Willison, Gary Marcus, Gwern
- **Development**: Dan Abramov, Mitchell Hashimoto, antirez
- **Security**: Troy Hunt, Krebs on Security, lcamtuf
- **Commentary**: Daring Fireball, Pluralistic, Paul Graham

## Tips

1. **Start small**: Test with 2-3 sources first before fetching all 92
2. **Use quality filter**: Add `--min-quality 70` to focus on high-quality content
3. **Combine filters**: Use both `--query` and `--sources` for precise results
4. **Check HTML output**: The HTML report has better formatting and dark mode support

## Troubleshooting

**Timeout errors**: Some RSS feeds may be slow or unavailable. The script will continue with other sources.

**No results**: Try increasing `--days` or removing the `--query` filter.

**Missing dependencies**: Run `pip3 install feedparser python-dateutil`
