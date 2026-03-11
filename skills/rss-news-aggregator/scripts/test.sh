#!/bin/bash
# Test script for RSS News Aggregator

set -e

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS_DIR="$SKILL_DIR/scripts"
OUTPUT_DIR="$SKILL_DIR/../../docs/news"

echo "🧪 Testing RSS News Aggregator..."
echo ""

# Check dependencies
echo "📦 Checking dependencies..."
python3 -c "import feedparser; import dateutil" 2>/dev/null || {
    echo "❌ Missing dependencies. Installing..."
    pip3 install feedparser python-dateutil
}
echo "✓ Dependencies OK"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"
mkdir -p /tmp/rss-test

# Test 1: Fetch RSS feeds (small sample)
echo "📡 Test 1: Fetching RSS feeds (3 sources, 3 days)..."
python3 "$SCRIPTS_DIR/fetch_rss.py" \
    --days 3 \
    --sources "simonwillison.net,garymarcus.substack.com,overreacted.io" \
    --output /tmp/rss-test/raw.json

if [ -f /tmp/rss-test/raw.json ]; then
    ITEM_COUNT=$(python3 -c "import json; data=json.load(open('/tmp/rss-test/raw.json')); print(data['total_items'])")
    echo "✓ Fetched $ITEM_COUNT items"
else
    echo "❌ Failed to fetch RSS feeds"
    exit 1
fi
echo ""

# Test 2: Filter content
echo "🔍 Test 2: Filtering content..."
python3 "$SCRIPTS_DIR/filter_content.py" \
    --input /tmp/rss-test/raw.json \
    --query "AI" \
    --output /tmp/rss-test/filtered.json

if [ -f /tmp/rss-test/filtered.json ]; then
    FILTERED_COUNT=$(python3 -c "import json; data=json.load(open('/tmp/rss-test/filtered.json')); print(data['total_items'])")
    echo "✓ Filtered to $FILTERED_COUNT items"
else
    echo "❌ Failed to filter content"
    exit 1
fi
echo ""

# Test 3: Generate reports
echo "📄 Test 3: Generating reports..."
python3 "$SCRIPTS_DIR/generate_report.py" \
    --input /tmp/rss-test/filtered.json \
    --output-dir /tmp/rss-test \
    --format both

if [ -f /tmp/rss-test/rss-news-*.md ] && [ -f /tmp/rss-test/rss-news-*.html ]; then
    echo "✓ Generated Markdown and HTML reports"
    echo ""
    echo "📁 Output files:"
    ls -lh /tmp/rss-test/rss-news-*
else
    echo "❌ Failed to generate reports"
    exit 1
fi
echo ""

echo "✅ All tests passed!"
echo ""
echo "📂 Test output location: /tmp/rss-test/"
echo "🌐 Open HTML report: open /tmp/rss-test/rss-news-*.html"
