import { execFileSync } from 'node:child_process'

const ports = process.argv
  .slice(2)
  .map(value => parseInt(value, 10))
  .filter(port => Number.isInteger(port) && port > 0)

if (ports.length === 0) {
  console.error('Usage: node scripts/kill-port.mjs <port> [more ports...]')
  process.exit(1)
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

function findWindowsPids(targetPort) {
  const output = run('netstat', ['-ano', '-p', 'tcp'])
  const pids = new Set()

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(new RegExp(`^\\s*TCP\\s+\\S+:${targetPort}\\s+\\S+\\s+\\S+\\s+(\\d+)$`))
    if (match) pids.add(match[1])
  }

  return [...pids]
}

function findUnixPids(targetPort) {
  const output = run('lsof', ['-ti', `:${targetPort}`]).trim()
  return output ? output.split(/\r?\n/).filter(Boolean) : []
}

function killPid(pid) {
  if (process.platform === 'win32') {
    execFileSync('taskkill', ['/F', '/PID', pid], { stdio: 'ignore' })
    return
  }

  execFileSync('kill', ['-9', pid], { stdio: 'ignore' })
}

try {
  for (const port of ports) {
    const pids = process.platform === 'win32' ? findWindowsPids(port) : findUnixPids(port)

    if (pids.length === 0) {
      continue
    }

    for (const pid of pids) {
      killPid(pid)
    }

    console.log(`Freed port ${port} by stopping PID(s): ${pids.join(', ')}`)
  }
} catch {
  process.exit(0)
}
