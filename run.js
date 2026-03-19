const fs = require('fs');
const { execSync } = require('child_process');
try {
  execSync('npm run build', {stdio: 'pipe'});
  console.log("SUCCESS");
} catch (e) {
  fs.writeFileSync('error.log', e.stdout.toString() + '\\n' + e.stderr.toString());
  console.log("WROTE ERROR LOG");
}
