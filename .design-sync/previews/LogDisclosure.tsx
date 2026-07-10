import { LogDisclosure } from '@synthograsizer/design-system';

export const OpenLog = () => (
  <LogDisclosure summary="Pipeline log" open>
    {`10:41  brief written (30 shots)
10:44  rendering 1–6 …
10:52  shot 2 QC 4.2 — queued for retake
10:58  shot 3 done QC 8.5
11:03  spend $142 / $300`}
  </LogDisclosure>
);

export const Collapsed = () => (
  <LogDisclosure summary="Pipeline log">
    {`10:41  brief written (30 shots)
10:44  rendering 1–6 …`}
  </LogDisclosure>
);
