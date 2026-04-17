param(
  [string]$Root = "C:\Users\luisd\Documents\Projetos 99",
  [string]$AccountId = "main"
)

$ErrorActionPreference = "Stop"

$accountRoot = Join-Path $Root "accounts\$AccountId"
$dailyRoot = Join-Path $accountRoot "daily"
$sharedRoot = Join-Path $Root "shared"

New-Item -ItemType Directory -Force -Path $dailyRoot | Out-Null
New-Item -ItemType Directory -Force -Path $sharedRoot | Out-Null

function Ensure-File {
  param(
    [string]$Path,
    [string]$Content
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
  }
}

$memory = @"
# Account Memory: $AccountId

## Current Positioning

## Winning Patterns

## Losing Patterns

## Price Guidance

## Active Opportunities

## Open Conversations

## Last Updated
"@

$playbook = @"
# Shared Playbook Summary

Winning pattern: clear pain + fast diagnosis + concrete proof + simple language + fair small/medium price + short delivery + easy next step.

Default posture: davi_sniper.

Avoid: over-follow-up, abstract platform pitch, heavy jargon, no-code promises for hard-code problems, and off-platform negotiation before acceptance.
"@

$templates = @"
# Templates

## Sniper

Opa, [nome]. Consigo resolver isso.

Pelo que entendi, o ponto principal e [diagnostico]. Eu faria [solucao] e deixaria testado em [prazo].

Para esse escopo, consigo fazer por R$ [valor]. Se fizer sentido, me envia [acesso/arquivo/repo] e ja comeco.

## Diagnostico

Opa, [nome]. Consigo te ajudar, mas tem um ponto que muda bastante prazo e valor: [variavel].

Hoje sua prioridade e resolver o fluxo basico funcionando ou ja deixar pronto para escalar?
"@

Ensure-File (Join-Path $accountRoot "memory.md") $memory
Ensure-File (Join-Path $accountRoot "opportunities.jsonl") ""
Ensure-File (Join-Path $accountRoot "proposals.jsonl") ""
Ensure-File (Join-Path $accountRoot "conversations.jsonl") ""
Ensure-File (Join-Path $accountRoot "deals.jsonl") ""
Ensure-File (Join-Path $accountRoot "tool-errors.jsonl") ""
Ensure-File (Join-Path $sharedRoot "playbook-summary.md") $playbook
Ensure-File (Join-Path $sharedRoot "templates.md") $templates

Write-Output "Initialized 99Freelas workspace at $Root for account $AccountId"
