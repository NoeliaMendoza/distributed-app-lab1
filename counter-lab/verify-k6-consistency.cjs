const fs = require('node:fs');
const assert = require('node:assert/strict');

try {
  const entries = fs.readFileSync(process.argv[2] || 'consistency-k6.log', 'utf8')
    .split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const messages = entries.map(entry => entry.msg).filter(msg => typeof msg === 'string');
  function boundary(prefix) {
    const matches = messages.filter(msg => msg.startsWith(prefix));
    assert.equal(matches.length, 1, `Se esperaba un registro ${prefix}`);
    const value = Number(matches[0].slice(prefix.length));
    assert.ok(Number.isSafeInteger(value));
    return value;
  }
  const initial = boundary('CONSISTENCY_INITIAL ');
  const final = boundary('CONSISTENCY_FINAL ');
  const values = messages.filter(msg => msg.startsWith('CONSISTENCY_VALUE '))
    .map(msg => JSON.parse(msg.slice('CONSISTENCY_VALUE '.length)));
  assert.equal(values.length, 100, 'Deben existir 100 respuestas válidas');
  assert.equal(new Set(values.map(value => value.vu)).size, 100, 'Deben participar 100 VUs');
  assert.equal(new Set(values.map(value => value.counter)).size, 100, 'Se detectaron duplicados');
  assert.ok(values.every(value => Number.isSafeInteger(value.counter) && value.counter > initial && value.counter <= initial + 100));
  assert.equal(final, initial + 100, 'El contador final no coincide');
  console.log(JSON.stringify({ initial, final, successful: values.length, duplicates: 0, pods: [...new Set(values.map(value => value.pod))] }, null, 2));
} catch (error) {
  console.error(`CONSISTENCY TEST FAILED: ${error.message}`);
  process.exitCode = 1;
}
