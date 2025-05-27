# Synthograsizer Development Roadmap

## 1. Mode B Routing System Implementation
- [ ] Design a data structure to store connections between Mode A variables
- [ ] Implement a visual interface to show and edit connections between variables
- [ ] Create logic to process variable relationships (e.g., when variable X changes, update variable Y)
- [ ] Add validation to prevent circular dependencies between variables
- [ ] Design routing visualization that is intuitive and skeuomorphic

## 2. UI Component Updates
- [ ] Sequencing words/text as notes (Mode B or advanced sequencer)
- [ ] Prompt-to-music mapping: enable direct use of prompt text as musical/compositional input
- [ ] Support for remixing and reinterpreting prompts in musical context
- [ ] Create a lightswitch component for boolean values
  - [ ] Design skeuomorphic lightswitch UI
  - [ ] Implement click handler for toggle functionality
  - [ ] Add animation for switch state changes
- [ ] Implement slider components for gradient/continuous values
  - [ ] Design skeuomorphic slider UI
  - [ ] Implement drag handler for value updates
  - [ ] Add visual feedback for current position/value
- [x] Keep knob design for cycling through text strings
  - [x] Fix the knob position continuation bug when clicking, releasing, and clicking again
  - [x] Ensure smooth rotation animation
  - [x] Maintain proper state between interaction sessions

## 3. Knob UI Bug Fixes
- [x] Fix knob click-release-click positioning issue
  - [x] Store the last angle/position when releasing
  - [x] Continue rotation from last position on next click
  - [x] Implement improved event handling for knob interaction
  - [x] Add proper state management for knob position between interactions

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
- [x] Ensure all new components work with existing MIDI functionality
- [x] Update variable state management to handle new component types
- [x] Maintain compatibility with existing JSON import/export
- [x] Add new component types to template system
- [x] Ensure visual consistency across all UI elements
- [x] Implement responsive design for different screen sizes

## 6. Testing & Refinement
- [ ] Ensure < 2 second load time
- [ ] Maintain 60 FPS during animations
- [ ] Ensure < 100ms response to user input
- [ ] Provide offline support after initial load
- [x] Test all component interactions
- [x] Verify MIDI mappings work with new component types
- [ ] Test edge cases in routing system (circular dependencies, etc.)
- [ ] Optimize performance for many simultaneous connections
- [ ] Create sample templates that showcase the routing system

## 7. Documentation & Help

## 8. Educational & Demonstration Features
- [ ] Interactive demonstration mode for educators
- [ ] Kinesthetic/visual teaching tools for prompt engineering and AI concepts
- [ ] Sample lesson plans or guides for using Synthograsizer in education
- [ ] Quick-start onboarding for "time to first creation" goal (<5 minutes)

- [ ] Update UI tooltips to explain new functionality
- [ ] Add visual indicators for possible connections
- [ ] Create simple documentation for routing system
- [ ] Add help modal or guide for new users
