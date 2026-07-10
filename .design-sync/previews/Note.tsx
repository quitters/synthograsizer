import { Note } from '@synthograsizer/design-system';

export const Info = () => (
  <Note>Brief written — 30 shots planned. Review the shot list below and start the farm.</Note>
);

export const Error = () => (
  <Note variant="error">Farm stopped: budget cap reached at $300.</Note>
);

export const HostedNotice = () => (
  <Note>
    Videorama renders run on a local Synthograsizer install — this hosted instance
    can browse but not generate.
  </Note>
);
