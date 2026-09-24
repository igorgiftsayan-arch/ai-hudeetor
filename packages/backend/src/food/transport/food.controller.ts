import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Inject, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiAcceptedResponse, ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { IdentityError } from '../../identity/domain/identity-error';
import { FoodService } from '../application/food.service';
// Request DTO values are required by Nest's emitted design:paramtypes metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ConfirmFoodConsumptionDto, CreateFoodAnalysisDto, CreateFoodUploadIntentDto, FoodCorrectionDto, UpdateFoodConsumptionDto } from './food.dto';
import { FoodActionPriceDto, FoodAnalysisResourceDto, FoodConsumptionPageDto, FoodConsumptionResourceDto, FoodUploadCompletionResourceDto, FoodUploadIntentResourceDto, QueuedFoodAnalysisResourceDto } from './food.dto';

@ApiTags('food')
@ApiCookieAuth()
@Controller()
export class FoodController {
  constructor(@Inject(FoodService) private readonly food: FoodService) {}

  @Get('ai-action-prices/food-photo-analysis')
  @ApiOkResponse({ type: FoodActionPriceDto })
  price(@Req() req: Request) { return this.food.price(token(req)); }

  @Post('food-images/upload-intents')
  @ApiCreatedResponse({ type: FoodUploadIntentResourceDto })
  uploadIntent(@Body() body: CreateFoodUploadIntentDto, @Req() req: Request) { return this.food.createUploadIntent(token(req), body); }

  @Post('food-images/:id/completions')
  @ApiOkResponse({ type: FoodUploadCompletionResourceDto })
  completeUpload(@Param('id') id: string, @Req() req: Request) { return this.food.completeUpload(token(req), id); }

  @Post('food-analyses')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiAcceptedResponse({ type: QueuedFoodAnalysisResourceDto })
  createAnalysis(@Body() body: CreateFoodAnalysisDto, @Req() req: Request, @Headers('idempotency-key') key?: string) { return this.food.createAnalysis(token(req), requiredKey(key), body); }

  @Get('food-analyses/:id')
  @ApiOkResponse({ type: FoodAnalysisResourceDto })
  analysis(@Param('id') id: string, @Req() req: Request) { return this.food.getAnalysis(token(req), id); }

  @Patch('food-analyses/:id/correction')
  @ApiOkResponse({ type: FoodAnalysisResourceDto })
  correction(@Param('id') id: string, @Body() body: FoodCorrectionDto, @Req() req: Request) { return this.food.correct(token(req), id, body); }

  @Post('food-analyses/:id/consumption-confirmations')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse({ type: FoodConsumptionResourceDto })
  confirm(@Param('id') id: string, @Body() body: ConfirmFoodConsumptionDto, @Req() req: Request, @Headers('idempotency-key') key?: string) { return this.food.confirmConsumption(token(req), requiredKey(key), id, body.consumedAt, body.timezone); }

  @Get('food-consumptions')
  @ApiOkResponse({ type: FoodConsumptionPageDto })
  consumptions(@Req() req: Request) { return this.food.listConsumptions(token(req)); }

  @Patch('food-consumptions/:id')
  @ApiHeader({name:'Idempotency-Key',required:true}) @ApiOkResponse({type:FoodConsumptionResourceDto})
  updateConsumption(@Param('id') id:string,@Body() body:UpdateFoodConsumptionDto,@Req() req:Request,@Headers('idempotency-key') key?:string){return this.food.updateConsumption(token(req),requiredKey(key),id,body);}

  @Delete('food-consumptions/:id') @HttpCode(204)
  @ApiHeader({name:'Idempotency-Key',required:true})
  deleteConsumption(@Param('id') id:string,@Req() req:Request,@Headers('idempotency-key') key?:string){return this.food.deleteConsumption(token(req),requiredKey(key),id);}
}

function token(req: Request) { return req.cookies?.atlas_access ?? ''; }
function requiredKey(value?: string) { if (!value || !/^[!-~]{16,128}$/.test(value)) throw new IdentityError('IDEMPOTENCY_KEY_REQUIRED',400,'A valid Idempotency-Key is required'); return value; }
