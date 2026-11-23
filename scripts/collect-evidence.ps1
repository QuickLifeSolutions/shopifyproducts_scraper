$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$entries = @()
foreach ($file in Get-ChildItem audit/run-*-start.json) {
    $start = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
    if (!$start.id) { continue }
    $run = (apify api ('actor-runs/' + $start.id) | ConvertFrom-Json).data
    if ($LASTEXITCODE) { throw "Cannot inspect run $($start.id)" }
    $summary = apify api ('key-value-stores/' + $run.defaultKeyValueStoreId + '/records/RUN_SUMMARY') | ConvertFrom-Json
    $label = $file.BaseName.Replace('-start','')
    $summary | ConvertTo-Json -Depth 15 | Set-Content "audit/$label-summary.json"
    $entries += [pscustomobject]@{
        label=$label;id=$run.id;actorId=$run.actId;buildId=$run.buildId;status=$run.status
        startedAt=$run.startedAt;finishedAt=$run.finishedAt;wallMillis=$run.stats.durationMillis
        memoryMbytes=$run.options.memoryMbytes;timeoutSecs=$run.options.timeoutSecs
        usageTotalUsd=$run.usageTotalUsd;usageUsd=$run.usageUsd
        datasetId=$run.defaultDatasetId;keyValueStoreId=$run.defaultKeyValueStoreId
        output=$run.output;summary=$summary
    }
    Write-Output "$label $($run.id): $($run.status), $($summary.rows) rows, $($run.usageTotalUsd) USD"
}
$entries | ConvertTo-Json -Depth 20 | Set-Content audit/cloud-evidence.json
$builds = @()
foreach ($file in Get-ChildItem audit/private-build-*.json) {
    $start=Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json
    if (!$start.build.id) { continue }
    $build=(apify api ('actor-builds/'+$start.build.id) | ConvertFrom-Json).data
    $builds += $build | Select-Object id,buildNumber,status,startedAt,finishedAt,usageTotalUsd
}
$builds | Sort-Object id -Unique | ConvertTo-Json -Depth 10 | Set-Content audit/build-evidence.json
