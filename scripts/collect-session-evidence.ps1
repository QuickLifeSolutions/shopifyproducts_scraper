param([switch]$BuildsOnly)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$directory = 'audit/session-followup'
$runs = if ($BuildsOnly) { @(Get-Content "$directory/cloud-evidence.json" -Raw | ConvertFrom-Json) } else { @() }
$runFiles = if ($BuildsOnly) { @() } else { Get-ChildItem "$directory/*-run-start.json" }
foreach ($file in $runFiles) {
    $start = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
    if (!$start.id) { continue }
    $run = (apify api ('actor-runs/' + $start.id) | ConvertFrom-Json).data
    if ($LASTEXITCODE) { throw "Cannot inspect run $($start.id)" }
    $label = $file.BaseName.Replace('-run-start','')
    $summary = $null
    if ($label -ne 'baseline') {
        $summary = apify api ('key-value-stores/' + $run.defaultKeyValueStoreId + '/records/RUN_SUMMARY') | ConvertFrom-Json
        if ($LASTEXITCODE) { throw "Cannot inspect summary $($start.id)" }
    }
    $rows = apify api ('datasets/' + $run.defaultDatasetId + '/items') -p '{"limit":100}' | ConvertFrom-Json
    if ($LASTEXITCODE) { throw "Cannot inspect dataset $($start.id)" }
    ConvertTo-Json -InputObject @($rows) -Depth 25 | Set-Content "$directory/$label-rows.json"
    $runs += [pscustomobject]@{
        label=$label;id=$run.id;buildId=$run.buildId;status=$run.status
        startedAt=$run.startedAt;finishedAt=$run.finishedAt;wallMillis=$run.stats.durationMillis
        memoryMbytes=$run.options.memoryMbytes;timeoutSecs=$run.options.timeoutSecs
        usageTotalUsd=$run.usageTotalUsd;usageUsd=$run.usageUsd
        datasetId=$run.defaultDatasetId;keyValueStoreId=$run.defaultKeyValueStoreId
        observedRows=@($rows).Count;output=$run.output;summary=$summary
    }
    Write-Output "$label $($run.id): $($run.status), $(@($rows).Count) rows"
}
if (!$BuildsOnly) { $runs | ConvertTo-Json -Depth 25 | Set-Content "$directory/cloud-evidence.json" }
$allBuilds = (apify api acts/EcVXdeCli75Lqff51/builds -p '{"limit":20,"desc":true}' | ConvertFrom-Json).data.items
$builds = @(foreach ($item in $allBuilds | Where-Object { [datetimeoffset]$_.startedAt -ge [datetimeoffset]'2026-11-23T16:40:00Z' }) {
    $build = (apify api ('actor-builds/' + $item.id) | ConvertFrom-Json).data
    if ($LASTEXITCODE) { throw "Cannot inspect build $($item.id)" }
    $build | Select-Object id,buildNumber,status,startedAt,finishedAt,usageTotalUsd,gitCommitId,gitBranchName
})
$builds | ConvertTo-Json -Depth 10 | Set-Content "$directory/build-evidence.json"
[pscustomobject]@{
    observedAt=(Get-Date).ToUniversalTime().ToString('o');runCount=$runs.Count;buildCount=$builds.Count
    runUsageUsd=($runs.usageTotalUsd | Measure-Object -Sum).Sum
    buildUsageUsd=($builds.usageTotalUsd | Measure-Object -Sum).Sum
    totalObservedUsd=(($runs.usageTotalUsd | Measure-Object -Sum).Sum+($builds.usageTotalUsd | Measure-Object -Sum).Sum)
} | ConvertTo-Json | Set-Content "$directory/cost-summary.json"
