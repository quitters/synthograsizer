import { SideNav, Button } from '@synthograsizer/design-system';

const projects = [
  { label: 'City-pop TV night', status: 'rendering · $42', active: true },
  { label: 'Security time-lapse', status: 'done · $118' },
  { label: 'Corporate betacam reel', status: 'writing · $0' },
];

export const Projects = () => (
  <SideNav heading="Projects" items={projects}>
    <Button variant="primary">+ New Set</Button>
  </SideNav>
);
