import re
import sys

# Force stdout to use utf-8
sys.stdout.reconfigure(encoding='utf-8')

def analyze_file(filename):
    print(f"=== ANALYZING {filename} ===")
    try:
        try:
            with open(filename, 'r', encoding='utf-16') as f:
                content = f.read()
        except Exception:
            with open(filename, 'r', encoding='utf-8') as f:
                content = f.read()
        
        matches = list(re.finditer(r'<script\b[^>]*>', content, re.IGNORECASE))
        for idx, match in enumerate(matches):
            start = match.start()
            end_match = content.find('</script>', start)
            if end_match != -1:
                tag_open = match.group(0)
                inner_content = content[match.end():end_match]
                
                src_match = re.search(r'src=["\']([^"\']+)["\']', tag_open, re.IGNORECASE)
                src = src_match.group(1) if src_match else None
                
                # Check for defer, async, type="module"
                is_async = 'async' in tag_open.lower()
                is_defer = 'defer' in tag_open.lower()
                is_module = 'type="module"' in tag_open.lower() or "type='module'" in tag_open.lower()
                
                line_no = content[:start].count('\n') + 1
                
                attrs = []
                if is_async: attrs.append('async')
                if is_defer: attrs.append('defer')
                if is_module: attrs.append('module')
                attr_str = f" [{', '.join(attrs)}]" if attrs else ""
                
                if src:
                    print(f"Line {line_no}: External Script{attr_str} -> src={src}")
                else:
                    snippet = inner_content.strip()[:100].replace('\n', ' ')
                    print(f"Line {line_no}: Inline Script{attr_str} -> {snippet}...")
    except Exception as e:
        print(f"Error reading {filename}: {e}")

analyze_file('index.html')
analyze_file('tool.html')
analyze_file('news.html')
