$env:EVERY = '1000'
foreach ($s in @('colins','ouninpohja','turini','vizzavona','hellsgate','monaco')) {
  foreach ($c in @('impreza','rs1800','mini','rally1')) {
    $o = node tools/phys-test.mjs $s $c 75 2>&1 | Select-String 'settle|FINISHED' | % { $_.Line }
    "{0,-11} {1,-8} {2}" -f $s, $c, ($o -join ' | ')
  }
}
