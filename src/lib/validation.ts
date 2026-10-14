export function passwordProblems(pw: string) {
  const issues: string[] = [];
  if (pw.length < 8) issues.push('at least 8 characters');
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) issues.push('upper- and lowercase letters');
  if (!/\d/.test(pw)) issues.push('a number');
  return issues;
}
