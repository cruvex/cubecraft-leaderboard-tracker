// Central Chart.js registration. Import { Chart } from here in any chart module
// so the controllers/elements are registered exactly once.
import {
  Chart,
  LineController,
  LineElement,
  LinearScale,
  BarController,
  BarElement,
  CategoryScale,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(
  LineController,
  LineElement,
  LinearScale,
  BarController,
  BarElement,
  CategoryScale,
  PointElement,
  Tooltip,
  Legend
);

export { Chart };
