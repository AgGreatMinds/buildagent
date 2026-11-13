// Cortado: o tap de statusline original não foi portado — contrato mínimo local para os testes.
// fixtures.ts só usa originalShell para achar o Git Bash no Windows; em POSIX o shell é /bin/sh e a função nunca é consultada.
// undefined = "Windows sem Git Bash" → os testes dependentes são pulados.
export function originalShell() {
  return undefined;
}
