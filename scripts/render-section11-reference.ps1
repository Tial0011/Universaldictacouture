# Read-only PDF rendering with Windows' built-in PDF renderer; output is ignored QA evidence.
param([Parameter(Mandatory=$true)][string]$Source, [Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Data.Pdf.PdfDocument, Windows.Data.Pdf, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
function Wait-Operation($Operation, $ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  $task.Result
}
$file = Wait-Operation ([Windows.Storage.StorageFile]::GetFileFromPathAsync((Resolve-Path -LiteralPath $Source).Path)) ([Windows.Storage.StorageFile])
$pdf = Wait-Operation ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])
$null = New-Item -ItemType Directory -Path $Output -Force
for ($index = 0; $index -lt $pdf.PageCount; $index++) {
  $page = $pdf.GetPage($index)
  $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  $action = $page.RenderToStreamAsync($stream)
  $actionMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
  $actionTask = $actionMethod.Invoke($null, @($action))
  $actionTask.Wait()
  $stream.Seek(0)
  $input = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
  $destination = Join-Path $Output ('page-{0:D2}.png' -f ($index + 1))
  $outputStream = [System.IO.File]::Create($destination)
  $input.CopyTo($outputStream)
  $outputStream.Dispose(); $input.Dispose(); $stream.Dispose(); $page.Dispose()
  Write-Output $destination
}
Write-Output ('Rendered {0} pages using Windows PDF.' -f $pdf.PageCount)
