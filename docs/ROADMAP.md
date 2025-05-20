# Synthograsizer Development Roadmap

## 1. Mode B Routing System Implementation
- [ ] Design a data structure to store connections between Mode A variables
- [ ] Implement a visual interface to show and edit connections between variables
- [ ] Create logic to process variable relationships (e.g., when variable X changes, update variable Y)
- [ ] Add validation to prevent circular dependencies between variables
- [ ] Design routing visualization that is intuitive and skeuomorphic

## 2. UI Component Updates
- [ ] Create a lightswitch component for boolean values
  - [ ] Design skeuomorphic lightswitch UI
  - [ ] Implement click handler for toggle functionality
  - [ ] Add animation for switch state changes
- [ ] Implement slider components for gradient/continuous values
  - [ ] Design skeuomorphic slider UI
  - [ ] Implement drag handler for value updates
  - [ ] Add visual feedback for current position/value
- [ ] Keep knob design for cycling through text strings
  - [ ] Fix the knob position continuation bug when clicking, releasing, and clicking again
  - [ ] Ensure smooth rotation animation
  - [ ] Maintain proper state between interaction sessions

## 3. Knob UI Bug Fixes
- [ ] Fix knob click-release-click positioning issue
  - [ ] Store the last angle/position when releasing
  - [ ] Continue rotation from last position on next click
  - [ ] Implement improved event handling for knob interaction
  - [ ] Add proper state management for knob position between interactions

## 4. Mode B Functionality Redesign
- [ ] Define clear behavior for how Mode B will connect variables in Mode A
  - [ ] Implement variable relationship types (trigger, scale, map, mirror, etc.)
  - [ ] Create interface for selecting relationship types
  - [ ] Add visual indicators for active connections between variables
- [ ] Design and implement connection creation UI
  - [ ] Add "draw connection" functionality between knobs/controls
  - [ ] Create editing interface for connection properties
  - [ ] Implement connection removal capability

## 5. Integration & Consistency
- [ ] Ensure all new components work with existing MIDI functionality
- [ ] Update variable state management to handle new component types
- [ ] Maintain compatibility with existing JSON import/export
- [ ] Add new component types to template system
- [ ] Ensure visual consistency across all UI elements
- [ ] Implement responsive design for different screen sizes

## 6. Testing & Refinement
- [ ] Test all component interactions
- [ ] Verify MIDI mappings work with new component types
- [ ] Test edge cases in routing system (circular dependencies, etc.)
- [ ] Optimize performance for many simultaneous connections
- [ ] Create sample templates that showcase the routing system

## 7. Documentation & Help
- [ ] Update UI tooltips to explain new functionality
- [ ] Add visual indicators for possible connections
- [ ] Create simple documentation for routing system
- [ ] Add help modal or guide for new users
