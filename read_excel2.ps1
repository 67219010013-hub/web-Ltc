$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$wb = $excel.Workbooks.Open('C:\Users\acer\Desktop\web Ltc\20260706094903.xlsx')
$ws = $wb.Sheets.Item(1)
$usedRange = $ws.UsedRange
$rows = $usedRange.Rows.Count
$cols = $usedRange.Columns.Count
Write-Host "Rows: $rows, Cols: $cols"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
for ($r = 3; $r -le [Math]::Min(10, $rows); $r++) {
    Write-Host "--- Row $r ---"
    for ($c = 1; $c -le $cols; $c++) {
        $val = $ws.Cells($r, $c).Text
        Write-Host "  Col $c : $val"
    }
}
$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
