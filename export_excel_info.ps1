$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$wb = $excel.Workbooks.Open('C:\Users\acer\Desktop\web Ltc\20260706094903.xlsx')
$ws = $wb.Sheets.Item(1)
$usedRange = $ws.UsedRange
$rows = $usedRange.Rows.Count
$cols = $usedRange.Columns.Count

$out = @()
for ($r = 3; $r -le [Math]::Min(15, $rows); $r++) {
    $rowText = "Row $r : "
    for ($c = 1; $c -le $cols; $c++) {
        $val = $ws.Cells($r, $c).Text
        $rowText += "Col " + $c + ": " + $val + " | "
    }
    $out += $rowText
}
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null

$out | Out-File -FilePath "C:\Users\acer\Desktop\web Ltc\excel_summary.txt" -Encoding utf8
Write-Host "Done writing to excel_summary.txt"
