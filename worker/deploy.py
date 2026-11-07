#!/usr/bin/env python3
"""Deploy Keeper Trade's Worker with Python's standard library only."""

import argparse
import getpass
import json
import os
from pathlib import Path
import tomllib
import urllib.error
import urllib.request

API = 'https://api.cloudflare.com/client/v4'
ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / 'wrangler.toml'
WORKER = ROOT / 'worker.js'
PLACEHOLDERS = {'REPLACE_WITH_AI_USAGE_KV_ID', 'REPLACE_WITH_AI_CACHE_KV_ID'}


def cloudflare(token, method, path, body=None, content_type='application/json'):
    data = body if isinstance(body, bytes) else json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(API + path, data=data, method=method)
    request.add_header('Authorization', f'Bearer {token}')
    request.add_header('Content-Type', content_type)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors='replace')
        raise RuntimeError(f'Cloudflare API HTTP {error.code}: {detail}') from error
    if not result.get('success', True):
        raise RuntimeError(f"Cloudflare API error: {result.get('errors') or result}")
    return result.get('result')


def create_namespace(token, account, title):
    result = cloudflare(token, 'POST', f'/accounts/{account}/storage/kv/namespaces', {'title': title})
    namespace_id = result.get('id')
    if not namespace_id:
        raise RuntimeError('Cloudflare did not return a KV namespace ID.')
    return namespace_id


def save_namespace_id(text, binding, namespace_id):
    marker = f'binding = "{binding}"'
    start = text.index(marker)
    line_start = text.index('id = "', start)
    line_end = text.index('\n', line_start)
    return text[:line_start] + f'id = "{namespace_id}"' + text[line_end:]


def multipart(metadata, script):
    boundary = '----keeper-trade-python-deploy'
    body = bytearray()
    body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n'.encode())
    body.extend(json.dumps(metadata).encode() + b'\r\n')
    body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="script"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n'.encode())
    body.extend(script.encode() + f'\r\n--{boundary}--\r\n'.encode())
    return bytes(body), f'multipart/form-data; boundary={boundary}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--account-id', default=os.environ.get('CLOUDFLARE_ACCOUNT_ID', ''))
    parser.add_argument('--origin', default=os.environ.get('KEEPER_TRADE_ORIGIN', ''))
    args = parser.parse_args()
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '')
    if not token:
        parser.error('Set CLOUDFLARE_API_TOKEN in this terminal first. Do not paste it into chat or a file.')
    if not args.account_id:
        parser.error('Set CLOUDFLARE_ACCOUNT_ID or pass --account-id.')

    config = tomllib.loads(CONFIG.read_text(encoding='utf-8'))
    origin = args.origin or config.get('vars', {}).get('ALLOWED_ORIGIN', '')
    if not origin.startswith('https://') or 'YOUR-GITHUB-USERNAME' in origin:
        parser.error('Set the exact public site origin in wrangler.toml or pass --origin https://your-domain.example.')

    cloudflare(token, 'GET', f'/accounts/{args.account_id}/storage/kv/namespaces?per_page=1')
    print('Cloudflare accepted the token and account ID.')

    text = CONFIG.read_text(encoding='utf-8')
    bindings = {item['binding']: item['id'] for item in config['kv_namespaces']}
    for binding, title in [('AI_USAGE', 'keeper-trade-ai-usage'), ('AI_CACHE', 'keeper-trade-ai-cache')]:
        namespace_id = bindings[binding]
        if namespace_id in PLACEHOLDERS:
            namespace_id = create_namespace(token, args.account_id, title)
            text = save_namespace_id(text, binding, namespace_id)
            bindings[binding] = namespace_id
            print(f'Created {binding} KV namespace: {namespace_id}')
    CONFIG.write_text(text, encoding='utf-8')

    worker_name = config['name']
    print(f'Ready to deploy {worker_name} for {origin}.')
    if input('Make these changes in your Cloudflare account? [y/N] ').strip().lower() != 'y':
        print('Deployment cancelled.')
        return
    anthropic_key = getpass.getpass('Anthropic API key (hidden; not saved): ').strip()
    if not anthropic_key:
        raise SystemExit('An Anthropic key is required for AI requests. Nothing was deployed.')
    yahoo_client_id = getpass.getpass('Yahoo client ID (optional; hidden; not saved): ').strip()
    yahoo_client_secret = getpass.getpass('Yahoo client secret (optional; hidden; not saved): ').strip()
    if bool(yahoo_client_id) != bool(yahoo_client_secret):
        raise SystemExit('Enter both Yahoo credentials or leave both empty. Nothing was deployed.')

    metadata = {
        'main_module': config['main'],
        'compatibility_date': config['compatibility_date'],
        'bindings': [
            *[{'type': 'kv_namespace', 'name': binding, 'namespace_id': namespace_id} for binding, namespace_id in bindings.items()],
            {'type': 'plain_text', 'name': 'ALLOWED_ORIGIN', 'text': origin},
            {'type': 'plain_text', 'name': 'DAILY_SPEND_CAP', 'text': str(config.get('vars', {}).get('DAILY_SPEND_CAP', '1.00'))},
            {'type': 'plain_text', 'name': 'ANTHROPIC_WORKSPACE_ID', 'text': str(config.get('vars', {}).get('ANTHROPIC_WORKSPACE_ID', ''))}
        ]
    }
    body, content_type = multipart(metadata, WORKER.read_text(encoding='utf-8'))
    cloudflare(token, 'PUT', f'/accounts/{args.account_id}/workers/scripts/{worker_name}', body, content_type)
    cloudflare(token, 'PUT', f'/accounts/{args.account_id}/workers/scripts/{worker_name}/secrets', {
        'name': 'ANTHROPIC_API_KEY', 'text': anthropic_key, 'type': 'secret_text'
    })
    if yahoo_client_id:
        cloudflare(token, 'PUT', f'/accounts/{args.account_id}/workers/scripts/{worker_name}/secrets', {
            'name': 'YAHOO_CLIENT_ID', 'text': yahoo_client_id, 'type': 'secret_text'
        })
        cloudflare(token, 'PUT', f'/accounts/{args.account_id}/workers/scripts/{worker_name}/secrets', {
            'name': 'YAHOO_CLIENT_SECRET', 'text': yahoo_client_secret, 'type': 'secret_text'
        })
    anthropic_key = ''
    yahoo_client_id = ''
    yahoo_client_secret = ''
    print(f'Deployed {worker_name}. The Anthropic secret and any Yahoo credentials were uploaded and were not saved locally.')
    print('Next: open the /ai/stats URL on your Worker and paste its base URL into Keeper Trade AI setup.')


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as error:
        print(f'Deployment stopped safely: {error}')
        if '401' in str(error):
            print('Cloudflare did not accept the token. Use a custom API token with Workers Scripts and Workers KV Storage edit permission. Do not use a Global API Key.')
        elif '403' in str(error):
            print('The token needs Workers Scripts and Workers KV Storage edit permission on this account.')
        print('Fix the local token, then run the same command again. No secret values were saved.')
