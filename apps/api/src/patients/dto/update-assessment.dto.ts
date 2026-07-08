import { CreateAssessmentDto } from './create-assessment.dto';

// Same shape as creation — every field optional. Inherits all validators.
export class UpdateAssessmentDto extends CreateAssessmentDto {}
