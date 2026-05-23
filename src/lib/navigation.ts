import type { NavigateFunction } from 'react-router-dom'

/**
 * Navigate back safely. If the user arrived via deep link (no history),
 * navigate to the fallback route instead.
 */
export function goBack(navigate: NavigateFunction, fallback = '/home') {
  if (window.history.length > 1) {
    navigate(-1)
  } else {
    navigate(fallback)
  }
}
