#!/usr/bin/env python3
"""
Content Filter and Quality Evaluator
Filters RSS items by keywords, topics, and evaluates quality scores.
"""

import argparse
import json
import re
from typing import List, Dict
from datetime import datetime, timezone

# Quality scoring keywords
HIGH_QUALITY_KEYWORDS = [
    'research', 'analysis', 'deep dive', 'comprehensive', 'tutorial',
    'guide', 'benchmark', 'performance', 'security', 'architecture',
    'engineering', 'technical', 'implementation', 'optimization'
]

LOW_QUALITY_KEYWORDS = [
    'clickbait', 'you won\'t believe', 'shocking', 'must see',
    'breaking', 'urgent', 'viral'
]

# Topic categories
TOPIC_CATEGORIES = {
    'AI/ML': ['ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'gpt',
              'claude', 'neural', 'deep learning', 'transformer', 'agent'],
    'Software Development': ['programming', 'code', 'software', 'development', 'developer',
                             'javascript', 'python', 'rust', 'go', 'typescript'],
    'Security': ['security', 'vulnerability', 'exploit', 'breach', 'encryption',
                 'authentication', 'privacy', 'cyber'],
    'System Architecture': ['architecture', 'infrastructure', 'distributed', 'scalability',
                           'microservices', 'kubernetes', 'docker', 'cloud'],
    'Web Development': ['web', 'frontend', 'backend', 'react', 'vue', 'api', 'http'],
    'DevOps': ['devops', 'ci/cd', 'deployment', 'monitoring', 'observability'],
    'Database': ['database', 'sql', 'nosql', 'postgres', 'mongodb', 'redis'],
    'Startup/Business': ['startup', 'business', 'entrepreneurship', 'funding', 'growth']
}

# Source authority weights
SOURCE_AUTHORITY = {
    'official': 1.5,  # Official blogs
    'academic': 1.3,  # Academic/research
    'tech_media': 1.2,  # Tech media
    'personal': 1.0   # Personal blogs (default)
}

def calculate_quality_score(item: Dict) -> float:
    """Calculate quality score (0-100) based on multiple factors."""
    score = 50.0  # Base score

    text = f"{item['title']} {item['summary']}".lower()

    # Content quality (30%)
    for keyword in HIGH_QUALITY_KEYWORDS:
        if keyword in text:
            score += 2

    for keyword in LOW_QUALITY_KEYWORDS:
        if keyword in text:
            score -= 5

    # Timeliness (20%)
    if item['published']:
        try:
            pub_date = datetime.fromisoformat(item['published'].replace('Z', '+00:00'))
            now = datetime.now(timezone.utc)
            hours_ago = (now - pub_date).total_seconds() / 3600

            if hours_ago < 24:
                score += 10
            elif hours_ago < 72:
                score += 5
        except:
            pass

    # Source authority (40%)
    source = item['source'].lower()
    authority_weight = SOURCE_AUTHORITY['personal']

    # Detect source type
    if any(x in source for x in ['microsoft', 'google', 'mozilla', 'github']):
        authority_weight = SOURCE_AUTHORITY['official']
    elif any(x in source for x in ['.edu', 'research', 'arxiv']):
        authority_weight = SOURCE_AUTHORITY['academic']
    elif any(x in source for x in ['techcrunch', 'wired', 'arstechnica']):
        authority_weight = SOURCE_AUTHORITY['tech_media']

    score *= authority_weight

    # Cap at 100
    return min(100.0, max(0.0, score))

def calculate_relevance_score(item: Dict, query: str) -> float:
    """Calculate relevance score (0-1) based on query match."""
    if not query:
        return 1.0

    text = f"{item['title']} {item['summary']}".lower()
    query_lower = query.lower()

    # Exact phrase match
    if query_lower in text:
        return 1.0

    # Word match
    query_words = query_lower.split()
    matches = sum(1 for word in query_words if word in text)

    return matches / len(query_words) if query_words else 0.0

def categorize_item(item: Dict) -> str:
    """Categorize item into topic category."""
    text = f"{item['title']} {item['summary']}".lower()

    best_category = 'Other'
    best_score = 0

    for category, keywords in TOPIC_CATEGORIES.items():
        score = sum(1 for keyword in keywords if keyword in text)
        if score > best_score:
            best_score = score
            best_category = category

    return best_category

def filter_items(items: List[Dict], query: str = '', sources: str = '',
                min_quality: float = 0.0) -> List[Dict]:
    """Filter and score items."""
    filtered = []

    # Parse source filter
    source_filter = [s.strip() for s in sources.split(',') if s.strip()] if sources else []

    for item in items:
        # Source filter
        if source_filter and item['source'] not in source_filter:
            continue

        # Calculate scores
        quality_score = calculate_quality_score(item)
        relevance_score = calculate_relevance_score(item, query)

        # Quality filter
        if quality_score < min_quality:
            continue

        # Query filter (require at least 30% relevance)
        if query and relevance_score < 0.3:
            continue

        # Add metadata
        item['quality_score'] = round(quality_score, 1)
        item['relevance_score'] = round(relevance_score, 2)
        item['category'] = categorize_item(item)
        item['final_score'] = round(quality_score * 0.6 + relevance_score * 100 * 0.4, 1)

        filtered.append(item)

    # Sort by final score
    filtered.sort(key=lambda x: x['final_score'], reverse=True)

    return filtered

def main():
    parser = argparse.ArgumentParser(description='Filter and score RSS items')
    parser.add_argument('--input', type=str, required=True, help='Input JSON file from fetch_rss.py')
    parser.add_argument('--output', type=str, help='Output JSON file path')
    parser.add_argument('--query', type=str, default='', help='Search query (keywords or natural language)')
    parser.add_argument('--sources', type=str, default='', help='Comma-separated source names')
    parser.add_argument('--min-quality', type=float, default=0.0, help='Minimum quality score (0-100)')
    args = parser.parse_args()

    # Load input
    with open(args.input, 'r', encoding='utf-8') as f:
        data = json.load(f)

    items = data['items']
    print(f"Loaded {len(items)} items", file=sys.stderr)

    # Filter
    filtered = filter_items(items, args.query, args.sources, args.min_quality)

    print(f"Filtered to {len(filtered)} items", file=sys.stderr)

    # Output
    output_data = {
        'filtered_at': datetime.now(timezone.utc).isoformat(),
        'query': args.query,
        'sources_filter': args.sources,
        'min_quality': args.min_quality,
        'total_items': len(filtered),
        'items': filtered
    }

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        print(f"✓ Saved to {args.output}", file=sys.stderr)
    else:
        print(json.dumps(output_data, indent=2, ensure_ascii=False))

if __name__ == '__main__':
    import sys
    main()
