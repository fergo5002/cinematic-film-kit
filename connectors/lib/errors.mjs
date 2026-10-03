// Error types shared by the CLI, the adapters and the MCP server.
//
// Exit codes: 0 done, 1 usage error, 2 refused before spending (budget, price,
// key, licence, retired model), 3 the provider returned an error, 4 the outcome
// is uncertain (a request timed out or came back unreadable after it may have
// been accepted, so it may have been charged).

export const EXIT = Object.freeze({ OK: 0, USAGE: 1, REFUSED: 2, PROVIDER: 3, UNCERTAIN: 4 });

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
    this.exitCode = EXIT.USAGE;
  }
}

export class RefusedError extends Error {
  constructor(message, reason = 'refused') {
    super(message);
    this.name = 'RefusedError';
    this.reason = reason;
    this.exitCode = EXIT.REFUSED;
  }
}

// kind is one of: auth, credit, rate, server, client, not-found, policy,
// failed, timeout, network, malformed, expired, redirect, aborted, error.
export class ProviderError extends Error {
  constructor({ provider, kind, status = null, code = null, message, requestId = null, uncertain = false, cause }) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ProviderError';
    this.provider = provider;
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    // uncertain: the provider may have accepted (and may charge for) the job.
    this.uncertain = uncertain;
    this.exitCode = uncertain ? EXIT.UNCERTAIN : EXIT.PROVIDER;
  }
}

const HINTS = {
  auth: 'The provider rejected the key. Check the key in .env or the environment; doctor shows which keys are set.',
  credit: 'The account is out of credit or over a spend limit. Top up on the provider site; retrying will not help.',
  rate: 'Rate limited. Wait and try again later.',
  server: 'The provider had a server error. Nothing was retried for a submit, so you were not charged twice.',
  timeout: 'The request timed out.',
  network: 'The provider could not be reached.',
  malformed: 'The provider sent a reply this tool could not read.',
  expired: 'The output link had expired or was missing when the file was fetched.',
  policy: 'The provider blocked the request on content grounds. Change the prompt or inputs; do not retry as is.',
  failed: 'The job failed on the provider side.',
  client: 'The provider rejected the request as invalid.',
  'not-found': 'The provider does not know this model or job.',
  redirect: 'The provider answered with a redirect. It was not followed, so the key went nowhere else.',
  aborted: 'The run was cancelled.',
};

export function hintFor(kind) {
  return HINTS[kind] ?? '';
}
