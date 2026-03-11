#!/usr/bin/env python3
"""
RSS Feed Fetcher and Parser
Fetches and parses RSS feeds from configured sources with concurrent processing.
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional
import feedparser
from dateutil import parser as date_parser

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

def load_sources(sources_file: Path) -> List[Dict]:
    """Load RSS sources from JSON configuration file."""
    with open(sources_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data['sources']

def parse_date(date_str) -> Optional[datetime]:
    """Parse various date formats to datetime object."""
    if not date_str:
        return None
    try:
        if isinstance(date_str, str):
            return date_parser.parse(date_str)
        # feedparser returns time.struct_time
        return datetime(*date_str[:6], tzinfo=timezone.utc)
    except:
        return None

def fetch_single_feed(source: Dict, days: int) -> List[Dict]:
    """Fetch and parse a single RSS feed."""
    items = []
    try:
        feed = feedparser.parse(source['xmlUrl'])

        if feed.bozo and not feed.entries:
            print(f"⚠️  Failed to parse {source['name']}: {feed.bozo_exception}", file=sys.stderr)
            return items

        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

        for entry in feed.entries:
            # Parse published date
            published = parse_date(entry.get('published_parsed') or entry.get('updated_parsed'))

            # Skip if too old
            if published and published < cutoff_date:
                continue

            # Extract content
            summary = entry.get('summary', entry.get('description', ''))
            if hasattr(entry, 'content') and entry.content:
                summary = entry.content[0].value

            items.append({
                'title': entry.get('title', 'Untitled'),
                'link': entry.get('link', ''),
                'summary': summary[:500],  # Limit summary length
                'author': entry.get('author', ''),
                'published': published.isoformat() if published else '',
                'source': source['name'],
                'source_url': source['htmlUrl'],
                'category': entry.get('category', '')
            })

        print(f"✓ {source['name']}: {len(items)} items", file=sys.stderr)

    except Exception as e:
        print(f"✗ {source['name']}: {str(e)}", file=sys.stderr)

    return items

def fetch_all_feeds(sources: List[Dict], days: int, max_workers: int = 10) -> List[Dict]:
    """Fetch all RSS feeds concurrently."""
    all_items = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetch_single_feed, source, days): source for source in sources}

        for future in as_completed(futures):
            items = future.result()
            all_items.extend(items)

    return all_items

def deduplicate_items(items: List[Dict]) -> List[Dict]:
    """Remove duplicate items based on URL."""
    seen_urls = set()
    unique_items = []

    for item in items:
        url = item['link']
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_items.append(item)

    return unique_items

def main():
    parser = argparse.ArgumentParser(description='Fetch RSS feeds from configured sources')
    parser.add_argument('--days', type=int, default=3, help='Number of days to fetch (default: 3)')
    parser.add_argument('--output', type=str, help='Output JSON file path')
    parser.add_argument('--sources', type=str, help='Comma-separated list of source names to fetch')
    args = parser.parse_args()

    # Load sources
    sources_file = Path(__file__).parent.parent / 'assets' / 'rss-sources.json'
    all_sources = load_sources(sources_file)

    # Filter sources if specified
    if args.sources:
        source_names = [s.strip() for s in args.sources.split(',')]
        all_sources = [s for s in all_sources if s['name'] in source_names]
        print(f"Fetching from {len(all_sources)} specified sources...", file=sys.stderr)
    else:
        print(f"Fetching from {len(all_sources)} sources...", file=sys.stderr)

    # Fetch feeds
    items = fetch_all_feeds(all_sources, args.days)

    # Deduplicate
    items = deduplicate_items(items)

    # Sort by published date (newest first)
    items.sort(key=lambda x: x['published'], reverse=True)

    print(f"\n✓ Total items fetched: {len(items)}", file=sys.stderr)

    # Output
    output_data = {
        'fetched_at': datetime.now(timezone.utc).isoformat(),
        'days': args.days,
        'total_items': len(items),
        'items': items
    }

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        print(f"✓ Saved to {args.output}", file=sys.stderr)
    else:
        print(json.dumps(output_data, indent=2, ensure_ascii=False))

if __name__ == '__main__':
    main()
