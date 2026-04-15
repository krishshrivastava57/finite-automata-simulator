# FiniteViz — Automata Simulator

An interactive Finite Automata Simulator built using HTML, CSS, and JavaScript. The application provides a complete environment to design, visualize, and simulate both Deterministic Finite Automata (DFA) and Nondeterministic Finite Automata (NFA).

---

## Features

* Interactive canvas for creating and positioning states
* Support for both DFA and NFA modes
* Custom alphabet definition
* Dynamic creation of transitions
* Step-by-step simulation of input strings
* Auto-run mode with controlled execution
* Real-time highlighting of active states and transitions
* Computation log for each step
* NFA active paths visualization
* Transition table (δ) view
* Batch testing for multiple input strings
* Predefined example automata for quick testing
* Zoom, pan, and fit view controls
* Clean and modern dark-themed UI

---

## Project Structure

```
finite-automata-simulator/
│── index.html      # Structure and SVG-based visualization
│── style.css       # Styling and UI design
│── script.js       # Automata logic and simulation engine
│── images/         # Screenshots (optional)
```

---

## How to Run

No installation required.

1. Download or clone the repository
2. Open the project folder
3. Run the application by opening:

```
index.html
```

The browser will automatically load the associated CSS and JavaScript files.

---

## How It Works

The simulator is based on the formal definition of Finite Automata.

For DFA:

* A single current state is maintained
* Each input symbol leads to exactly one transition

For NFA:

* Multiple states can be active simultaneously
* Transitions are handled using sets of states
* Epsilon transitions are processed using closure

During simulation:

* The input string is processed symbol by symbol
* The current state(s) are updated dynamically
* Transitions are visually highlighted
* A computation log tracks each step

At the end, the simulator checks whether the final state (or any active state in NFA) is an accepting state and displays the result as ACCEPTED or REJECTED.

---

## Example

Consider a DFA that accepts strings ending with "10".

Input:

```
0110
```

Step-by-step execution:

* Start at initial state q0
* Read '0' → transition to q1
* Read '1' → transition to q2
* Read '1' → transition to q2
* Read '0' → transition to accepting state q3

Final State:

```
q3 (Accepting State)
```

Output:

```
ACCEPTED
```

This example demonstrates how the automaton processes each symbol sequentially and determines acceptance based on the final state.


## Technologies Used

* HTML for structure and layout
* CSS for styling and UI design
* JavaScript for simulation logic and interactivity
* SVG for graph visualization of states and transitions

---

## Limitations

* Focused on DFA and basic NFA simulation
* No persistent storage (data resets on refresh)
* Designed primarily for learning and visualization

---

## Author

Krish Shrivastava  
B.Tech CSE, NSUT  
Course: Theory of Automata and Formal Languages

## Note

This project was developed as part of the course *Theory of Automata and Formal Languages*. It demonstrates how abstract automata concepts can be visualized and understood through interactive simulation.

