// Shape of one engine deploy log line.
export interface DeployLogLine {
  // Unix seconds.
  ts?: number | string | null
  stage?: string | null
  msg?: string | null
  // DeployLogsConsole colour: ok | info | warn | error, anything else is dim.
  level?: string | null
}
