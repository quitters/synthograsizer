/**
 * The creation flow and the running of what it makes.
 *
 *   /api/company/flow              propose a company from one prompt, read it, edit it, cast it, create it
 *   /api/company/:id/run/:dept     start a room of a created company with the brief and checks the flow wrote for it, and close it out afterwards
 *
 * Every step a person takes here is an API call with a schema (GET /api/company/schema), so an agent can do the same. What is NOT here, on purpose: any
 * way to start a company running (that is POST /:id/go, and only its owner), to approve anything for publication, or to change a safety setting from a
 * prompt. A created company is paused.
 */
import { Router } from 'express';
import { SCHEMAS } from '../company/schema.js';
import { handle, checkBody } from './httpUtil.js';

/** @param {ReturnType<import('../company/index.js').createCompanyServices>} services */
export function createFlowRouter(services) {
  const router = Router();
  const { flow } = services;

  router.get('/options', handle((req, res) => res.json(flow.options())));

  router.get('/', handle((req, res) => res.json({ flows: flow.list(req.visitorId) })));

  router.post('/', handle(async (req, res) => {
    checkBody(SCHEMAS.flowPropose, req.body);
    const proposed = await flow.propose(req.visitorId, req.body);
    res.status(201).json({
      flow: proposed,
      note: 'This is a proposal; nothing exists yet and almost nothing has been spent. Edit it (PATCH /api/company/flow/:id), then write the people (POST .../cast), then create the company (POST .../create). It will be created paused.',
    });
  }));

  router.get('/:id', handle((req, res) => res.json({ flow: flow.get(req.visitorId, req.params.id) })));

  router.patch('/:id', handle(async (req, res) => {
    checkBody(SCHEMAS.flowEdit, req.body);
    res.json({ flow: await flow.edit(req.visitorId, req.params.id, req.body) });
  }));

  router.post('/:id/replan', handle(async (req, res) => {
    res.json({ flow: await flow.replan(req.visitorId, req.params.id) });
  }));

  router.post('/:id/cast', handle((req, res) => {
    checkBody(SCHEMAS.flowCast, req.body);
    res.status(202).json({
      flow: flow.cast(req.visitorId, req.params.id, req.body),
      note: 'Casting runs in the background. Poll GET /api/company/flow/:id until its state is "cast" (or "proposed" with positions still open, or "failed"). POST .../cancel stops it.',
    });
  }));

  router.post('/:id/cancel', handle((req, res) => res.json({ flow: flow.cancel(req.visitorId, req.params.id) })));

  router.post('/:id/create', handle((req, res) => {
    const made = flow.create(req.visitorId, req.params.id);
    res.status(201).json({
      ...made,
      note: 'The company is paused. Nothing runs, spends or publishes until you say go (POST /api/company/:id/go). Then start a room with POST /api/company/:id/run/:department/start.',
    });
  }));

  router.delete('/:id', handle((req, res) => res.json(flow.remove(req.visitorId, req.params.id))));

  return router;
}

/** @param {ReturnType<import('../company/index.js').createCompanyServices>} services */
export function createRunRouter(services) {
  const router = Router({ mergeParams: true });
  const { flow } = services;

  router.post('/:dept/start', handle(async (req, res) => {
    res.json(await flow.startDepartment(req.visitorId, req.params.id, req.params.dept));
  }));

  router.post('/:dept/close-out', handle(async (req, res) => {
    const body = checkBody(SCHEMAS.flowCloseOut, req.body);
    res.json(await flow.closeOutDepartment(req.visitorId, req.params.id, req.params.dept, { session: body.session || null }));
  }));

  return router;
}
