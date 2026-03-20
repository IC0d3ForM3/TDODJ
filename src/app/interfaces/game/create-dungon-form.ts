import { FormControl } from '@angular/forms';

export interface CreateDungonForm {
  name: FormControl<string>;
  description: FormControl<string>;
  intro: FormControl<string>;
  minsplifetime: FormControl<number>;
  maxsplifetime: FormControl<number>;
  spreward: FormControl<number>;
}
