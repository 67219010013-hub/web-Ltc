$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$wb = $excel.Workbooks.Open('C:\Users\acer\Desktop\web Ltc\20260706094903.xlsx')
$ws = $wb.Sheets.Item(1)
$usedRange = $ws.UsedRange
$rows = $usedRange.Rows.Count

$codes = @{}
for ($r = 4; $r -le $rows; $r++) {
    $groupCode = $ws.Cells($r, 4).Text.Trim()
    $classGroup = $ws.Cells($r, 5).Text.Trim()
    if ($groupCode) {
        $codes[$groupCode] = $classGroup
    }
}
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

$codes.GetEnumerator() | Sort-Object Name | ForEach-Object {
    [PSCustomObject]@{
        GroupCode = $_.Key
        ExampleClass = $_.Value
    }
} | Export-Csv -Path "C:\Users\acer\Desktop\web Ltc\group_codes.csv" -NoTypeInformation -Encoding utf8

Write-Host "Done exported to group_codes.csv"
